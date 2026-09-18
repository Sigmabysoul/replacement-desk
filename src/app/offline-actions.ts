"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE } from "@/lib/replacements/validation";
import {
  cancelOfflineOrderSchema,
  confirmDeliverySchema,
  confirmPackingSchema,
  createOfflineOrderSchema,
  dispatchOrderSchema,
  offlineOrderCommentSchema,
} from "@/lib/offline-orders/validation";
import { safeFileName } from "@/lib/utils";
import { verifyFileSignature } from "@/lib/security/magic-bytes";
import type { OfflineOrder, OfflineOrderAttachmentType } from "@/lib/types";

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Your change was not saved.";
}

function formFiles(formData: FormData, key: string): File[] {
  return formData.getAll(key).filter((value): value is File => value instanceof File && value.size > 0);
}

async function validateOfflineFiles(files: File[]): Promise<void> {
  for (const file of files) {
    if (file.size > MAX_FILE_SIZE) throw new Error(`${file.name} is larger than 25 MB.`);
    if (!ALLOWED_MIME_TYPES.has(file.type)) throw new Error(`${file.name} is not a supported file type.`);
    const validSignature = await verifyFileSignature(file);
    if (!validSignature) throw new Error(`${file.name} is corrupted or has an unrecognized file header.`);
  }
}

async function uploadOfflineFiles(
  orderId: string,
  files: File[],
  type: OfflineOrderAttachmentType,
  folder: string,
) {
  const profile = await requireProfile();
  const supabase = await createClient();
  const uploaded: string[] = [];
  const rows = [];
  for (const file of files) {
    const path = `offline-orders/${orderId}/${folder}/${randomUUID()}-${safeFileName(file.name)}`;
    const { error } = await supabase.storage.from("offline-order-files").upload(path, file, {
      contentType: file.type,
      upsert: false,
    });
    if (error) {
      if (uploaded.length) await supabase.storage.from("offline-order-files").remove(uploaded);
      throw new Error(`Could not upload ${file.name}. Try again.`);
    }
    uploaded.push(path);
    rows.push({
      offline_order_id: orderId,
      attachment_type: type,
      storage_path: path,
      file_name: safeFileName(file.name),
      mime_type: file.type,
      uploaded_by: profile.id,
    });
  }
  return { rows, uploaded };
}

async function cleanupUncommittedOfflineUploads(
  supabase: Awaited<ReturnType<typeof createClient>>,
  uploaded: string[],
) {
  if (!uploaded.length) return;
  const { count, error } = await supabase
    .from("offline_order_attachments")
    .select("id", { count: "exact", head: true })
    .in("storage_path", uploaded);
  if (!error && count === 0) {
    await supabase.storage.from("offline-order-files").remove(uploaded);
  }
}

/**
 * Boss or Admin creates a new offline order.
 */
export async function createOfflineOrderAction(formData: FormData) {
  await requireProfile(["BOSS", "ADMIN"]);
  const parsed = createOfflineOrderSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(`/offline-orders/new?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Check the form.")}`);
  }

  const orderId = randomUUID();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("create_offline_order", {
    p_id: orderId,
    p_so_number: parsed.data.so_number,
    p_brand: parsed.data.brand ?? null,
    p_product_name: parsed.data.product_name,
    p_quantity: parsed.data.quantity,
    p_unit: parsed.data.unit,
    p_logistics_partner: parsed.data.logistics_partner ?? null,
    p_dispatch_date: parsed.data.dispatch_date ?? null,
    p_notes: parsed.data.notes ?? null,
  });

  if (error || !data) {
    redirect(`/offline-orders/new?error=${encodeURIComponent(error?.message ?? "Could not create offline order.")}`);
  }

  const order = data as OfflineOrder;
  revalidatePath("/offline-orders");
  revalidatePath("/");
  redirect(`/offline-orders/${order.id}?success=${encodeURIComponent(`Offline order ${order.so_number} created.`)}`);
}

/**
 * Print Team confirms printing for an offline order.
 */
export async function confirmPrintingAction(formData: FormData) {
  await requireProfile(["PRINTING", "ADMIN"]);
  const orderId = String(formData.get("order_id") ?? "");
  if (!orderId) redirect("/offline-orders?error=Invalid%20order.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("confirm_offline_printed", { p_order_id: orderId });
  if (error) redirect(`/offline-orders/${orderId}?error=${encodeURIComponent(error.message)}`);

  revalidatePath("/offline-orders");
  revalidatePath(`/offline-orders/${orderId}`);
  revalidatePath("/");
  redirect(`/offline-orders/${orderId}?success=${encodeURIComponent("Materials and photos confirmed as printed.")}`);
}

/**
 * Consignment Team confirms packing with carton count, dimensions, and weight.
 */
export async function confirmPackingAction(formData: FormData) {
  await requireProfile(["CONSIGNMENT", "ADMIN"]);
  const orderId = String(formData.get("order_id") ?? "");
  const parsed = confirmPackingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(`/offline-orders/${orderId}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid packing details.")}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("confirm_offline_packing", {
    p_order_id: parsed.data.order_id,
    p_carton_count: parsed.data.carton_count,
    p_carton_dimensions: parsed.data.carton_dimensions ?? null,
    p_carton_weight_kg: parsed.data.carton_weight_kg ?? null,
  });

  if (error) redirect(`/offline-orders/${orderId}?error=${encodeURIComponent(error.message)}`);

  revalidatePath("/offline-orders");
  revalidatePath(`/offline-orders/${orderId}`);
  revalidatePath("/");
  redirect(`/offline-orders/${orderId}?success=${encodeURIComponent("Packing details confirmed. Ready for HR dispatch details.")}`);
}

/**
 * HR prepares dispatch details with LR number, tracking URL, and compressed photos.
 */
export async function dispatchPrepareOfflineOrderAction(formData: FormData) {
  await requireProfile(["HR", "ADMIN"]);
  const orderId = String(formData.get("order_id") ?? "");
  const parsed = dispatchOrderSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(`/offline-orders/${orderId}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid dispatch details.")}`);
  }

  const files = formFiles(formData, "dispatch_documents");
  if (files.length > 20) {
    redirect(`/offline-orders/${orderId}?error=${encodeURIComponent("Maximum 20 documents and photos allowed.")}`);
  }

  try {
    await validateOfflineFiles(files);
  } catch (error) {
    redirect(`/offline-orders/${orderId}?error=${encodeURIComponent(messageFrom(error))}`);
  }

  const supabase = await createClient();
  const uploaded: string[] = [];
  try {
    let attachmentRows: unknown[] = [];
    if (files.length > 0) {
      const uploadResult = await uploadOfflineFiles(orderId, files, "DISPATCH_DOC", "dispatch");
      uploaded.push(...uploadResult.uploaded);
      attachmentRows = uploadResult.rows;
    }

    const { error } = await supabase.rpc("dispatch_prepare_offline_order", {
      p_order_id: parsed.data.order_id,
      p_lr_number: parsed.data.lr_number ?? null,
      p_tracking_url: parsed.data.tracking_url ?? null,
      p_logistics_partner: parsed.data.logistics_partner ?? null,
      p_attachments: attachmentRows,
    });

    if (error) throw error;
  } catch (error) {
    await cleanupUncommittedOfflineUploads(supabase, uploaded);
    redirect(`/offline-orders/${orderId}?error=${encodeURIComponent(messageFrom(error))}`);
  }

  revalidatePath("/offline-orders");
  revalidatePath(`/offline-orders/${orderId}`);
  revalidatePath("/");
  redirect(`/offline-orders/${orderId}?success=${encodeURIComponent("Dispatch details & photos saved. Sent to Print team.")}`);
}

export const dispatchOfflineOrderAction = dispatchPrepareOfflineOrderAction;

/**
 * Consignment Team confirms pickup by the courier.
 */
export async function confirmPickupAction(formData: FormData) {
  await requireProfile(["CONSIGNMENT", "ADMIN"]);
  const orderId = String(formData.get("order_id") ?? "");
  if (!orderId) redirect("/offline-orders?error=Invalid%20order.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("confirm_offline_pickup", { p_order_id: orderId });
  if (error) redirect(`/offline-orders/${orderId}?error=${encodeURIComponent(error.message)}`);

  revalidatePath("/offline-orders");
  revalidatePath(`/offline-orders/${orderId}`);
  revalidatePath("/");
  redirect(`/offline-orders/${orderId}?success=${encodeURIComponent("Pickup confirmed.")}`);
}

/**
 * HR confirms delivery and attaches Proof of Delivery (POD).
 */
export async function confirmDeliveryAction(formData: FormData) {
  await requireProfile(["HR", "ADMIN"]);
  const orderId = String(formData.get("order_id") ?? "");
  const parsed = confirmDeliverySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(`/offline-orders/${orderId}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid delivery details.")}`);
  }

  const files = formFiles(formData, "pod_documents");
  if (files.length > 10) {
    redirect(`/offline-orders/${orderId}?error=${encodeURIComponent("Maximum 10 POD documents allowed.")}`);
  }

  try {
    await validateOfflineFiles(files);
  } catch (error) {
    redirect(`/offline-orders/${orderId}?error=${encodeURIComponent(messageFrom(error))}`);
  }

  const supabase = await createClient();
  const uploaded: string[] = [];
  try {
    let attachmentRows: unknown[] = [];
    if (files.length > 0) {
      const uploadResult = await uploadOfflineFiles(orderId, files, "POD", "pod");
      uploaded.push(...uploadResult.uploaded);
      attachmentRows = uploadResult.rows;
    }

    const { error } = await supabase.rpc("confirm_offline_delivery", {
      p_order_id: parsed.data.order_id,
      p_pod_notes: parsed.data.pod_notes ?? null,
      p_attachments: attachmentRows,
    });

    if (error) throw error;
  } catch (error) {
    await cleanupUncommittedOfflineUploads(supabase, uploaded);
    redirect(`/offline-orders/${orderId}?error=${encodeURIComponent(messageFrom(error))}`);
  }

  revalidatePath("/offline-orders");
  revalidatePath(`/offline-orders/${orderId}`);
  revalidatePath("/");
  redirect(`/offline-orders/${orderId}?success=${encodeURIComponent("Delivery confirmed.")}`);
}

/**
 * Boss acknowledges the completed delivery.
 */
export async function acknowledgeOrderAction(formData: FormData) {
  await requireProfile(["BOSS", "ADMIN"]);
  const orderId = String(formData.get("order_id") ?? "");
  if (!orderId) redirect("/offline-orders?error=Invalid%20order.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("acknowledge_offline_order", { p_order_id: orderId });
  if (error) redirect(`/offline-orders/${orderId}?error=${encodeURIComponent(error.message)}`);

  revalidatePath("/offline-orders");
  revalidatePath(`/offline-orders/${orderId}`);
  revalidatePath("/");
  redirect(`/offline-orders/${orderId}?success=${encodeURIComponent("Order acknowledged.")}`);
}

/**
 * Adds an audit comment to an offline order.
 */
export async function addOfflineCommentAction(formData: FormData) {
  await requireProfile();
  const orderId = String(formData.get("order_id") ?? "");
  const parsed = offlineOrderCommentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(`/offline-orders/${orderId}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid comment.")}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("add_offline_order_comment", {
    p_order_id: parsed.data.order_id,
    p_message: parsed.data.message,
  });

  if (error) redirect(`/offline-orders/${orderId}?error=${encodeURIComponent(error.message)}`);

  revalidatePath(`/offline-orders/${orderId}`);
  redirect(`/offline-orders/${orderId}`);
}

/**
 * Boss or Admin cancels an offline order.
 */
export async function cancelOfflineOrderAction(formData: FormData) {
  await requireProfile(["BOSS", "ADMIN"]);
  const orderId = String(formData.get("order_id") ?? "");
  const parsed = cancelOfflineOrderSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(`/offline-orders/${orderId}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "A cancellation reason is required.")}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_offline_order", {
    p_order_id: parsed.data.order_id,
    p_reason: parsed.data.reason,
  });

  if (error) redirect(`/offline-orders/${orderId}?error=${encodeURIComponent(error.message)}`);

  revalidatePath("/offline-orders");
  revalidatePath(`/offline-orders/${orderId}`);
  revalidatePath("/");
  redirect(`/offline-orders/${orderId}?success=${encodeURIComponent("Order cancelled.")}`);
}

