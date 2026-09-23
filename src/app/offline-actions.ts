"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { invalidateDashboardCache } from "@/lib/cache/dashboard-cache";
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE } from "@/lib/replacements/validation";
import {
  cancelOfflineOrderSchema,
  confirmDeliverySchema,
  confirmPackingSchema,
  createOfflineOrderSchema,
  customerPresetSchema,
  offlineOrderItemsSchema,
  dispatchOrderSchema,
  offlineOrderCommentSchema,
  updateOfflineOrderNumberSchema,
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
 * Boss, HR, or Admin creates a new offline order.
 */
export async function createOfflineOrderAction(formData: FormData) {
  await requireProfile(["BOSS", "HR", "ADMIN"]);
  let rawItems: unknown;
  try {
    rawItems = JSON.parse(String(formData.get("items_manifest") ?? "null"));
  } catch {
    redirect(`/offline-orders/new?error=${encodeURIComponent("The item list is invalid. Refresh and try again.")}`);
  }
  const parsedItems = offlineOrderItemsSchema.safeParse(rawItems);
  if (!parsedItems.success) {
    redirect(`/offline-orders/new?error=${encodeURIComponent(parsedItems.error.issues[0]?.message ?? "Check every item.")}`);
  }
  const primaryItem = parsedItems.data[0];
  const parsed = createOfflineOrderSchema.safeParse({
    ...Object.fromEntries(formData),
    product_name: primaryItem.product_name,
    quantity: primaryItem.quantity,
  });
  if (!parsed.success) {
    redirect(`/offline-orders/new?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Check the form.")}`);
  }

  const orderId = randomUUID();
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("create_offline_order_with_items", {
    p_id: orderId,
    p_so_number: parsed.data.so_number,
    p_brand: parsed.data.brand ?? null,
    p_product_name: parsed.data.product_name,
    p_quantity: parsed.data.quantity,
    p_unit: parsed.data.unit,
    p_logistics_partner: parsed.data.logistics_partner ?? null,
    p_dispatch_date: parsed.data.dispatch_date ?? null,
    p_notes: parsed.data.notes ?? null,
    p_order_number: parsed.data.order_number ?? null,
    p_items: parsedItems.data,
    p_customer_name: parsed.data.customer_name ?? null,
    p_customer_address: parsed.data.customer_address ?? null,
    p_customer_phone: parsed.data.customer_phone ?? null,
    p_customer_email: parsed.data.customer_email ?? null,
    p_customer_preset_id: parsed.data.customer_preset_id ?? null,
  });

  if (error || !data) {
    redirect(`/offline-orders/new?error=${encodeURIComponent(error?.message ?? "Could not create offline order.")}`);
  }

  const order = data as OfflineOrder;
  invalidateDashboardCache();
  revalidatePath("/offline-orders");
  revalidatePath("/");
  redirect(`/offline-orders/${order.id}?success=${encodeURIComponent(`Offline order ${order.so_number} created.`)}`);
}

/**
 * Updates an offline order's numeric Order ID.
 * Authorized for BOSS, HR, CUSTOMER_SUPPORT, and ADMIN.
 */
export async function updateOfflineOrderNumberAction(formData: FormData) {
  await requireProfile(["BOSS", "HR", "CUSTOMER_SUPPORT", "ADMIN"]);
  const orderId = String(formData.get("order_id") ?? "");
  const parsed = updateOfflineOrderNumberSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(`/offline-orders/${orderId}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid Order ID.")}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_offline_order_number", {
    p_order_id: parsed.data.order_id,
    p_order_number: parsed.data.order_number,
  });

  if (error) {
    redirect(`/offline-orders/${orderId}?error=${encodeURIComponent(error.message)}`);
  }

  invalidateDashboardCache();
  revalidatePath("/offline-orders");
  revalidatePath(`/offline-orders/${orderId}`);
  revalidatePath("/");
  redirect(`/offline-orders/${orderId}?success=${encodeURIComponent(`Order ID updated to #${parsed.data.order_number}. Subsequent orders will increment from this.`)}`);
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

  invalidateDashboardCache();
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

  invalidateDashboardCache();
  revalidatePath("/offline-orders");
  revalidatePath(`/offline-orders/${orderId}`);
  revalidatePath("/");
  redirect(`/offline-orders/${orderId}?success=${encodeURIComponent("Packing details confirmed. Ready for HR dispatch details.")}`);
}

/**
 * Logistics prepares dispatch details with LR number, tracking URL, and shipping label / dispatch photos.
 */
export async function dispatchPrepareOfflineOrderAction(formData: FormData) {
  await requireProfile(["LOGISTICS", "ADMIN"]);
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

  invalidateDashboardCache();
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

  invalidateDashboardCache();
  revalidatePath("/offline-orders");
  revalidatePath(`/offline-orders/${orderId}`);
  revalidatePath("/");
  redirect(`/offline-orders/${orderId}?success=${encodeURIComponent("Pickup confirmed.")}`);
}

/**
 * HR or Logistics confirms delivery and attaches Proof of Delivery (POD).
 */
export async function confirmDeliveryAction(formData: FormData) {
  await requireProfile(["HR", "LOGISTICS", "ADMIN"]);
  const orderId = String(formData.get("order_id") ?? "");
  const returnTo = String(formData.get("return_to") ?? "");
  const parsed = confirmDeliverySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const errorMsg = parsed.error.issues[0]?.message ?? "Invalid delivery details.";
    if (returnTo.startsWith("/tracking")) {
      redirect(`/tracking?error=${encodeURIComponent(errorMsg)}`);
    }
    redirect(`/offline-orders/${orderId}?error=${encodeURIComponent(errorMsg)}`);
  }

  const files = formFiles(formData, "pod_documents");
  if (files.length > 10) {
    const errorMsg = "Maximum 10 POD documents allowed.";
    if (returnTo.startsWith("/tracking")) {
      redirect(`/tracking?error=${encodeURIComponent(errorMsg)}`);
    }
    redirect(`/offline-orders/${orderId}?error=${encodeURIComponent(errorMsg)}`);
  }

  try {
    await validateOfflineFiles(files);
  } catch (error) {
    const errorMsg = messageFrom(error);
    if (returnTo.startsWith("/tracking")) {
      redirect(`/tracking?error=${encodeURIComponent(errorMsg)}`);
    }
    redirect(`/offline-orders/${orderId}?error=${encodeURIComponent(errorMsg)}`);
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
    const errorMsg = messageFrom(error);
    if (returnTo.startsWith("/tracking")) {
      redirect(`/tracking?error=${encodeURIComponent(errorMsg)}`);
    }
    redirect(`/offline-orders/${orderId}?error=${encodeURIComponent(errorMsg)}`);
  }

  invalidateDashboardCache();
  revalidatePath("/offline-orders");
  revalidatePath(`/offline-orders/${orderId}`);
  revalidatePath("/tracking");
  revalidatePath("/");
  if (returnTo.startsWith("/tracking")) {
    redirect(`/tracking?success=${encodeURIComponent("Offline order delivery confirmed.")}`);
  }
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

  invalidateDashboardCache();
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

  invalidateDashboardCache();
  revalidatePath("/offline-orders");
  revalidatePath(`/offline-orders/${orderId}`);
  revalidatePath("/");
  redirect(`/offline-orders/${orderId}?success=${encodeURIComponent("Order cancelled.")}`);
}

/**
 * Admin or Customer Support permanently deletes an offline order and all related database records and stored files.
 */
export async function deleteOfflineOrderAction(formData: FormData) {
  await requireProfile(["ADMIN", "CUSTOMER_SUPPORT"]);
  const orderId = String(formData.get("order_id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) {
    redirect("/offline-orders?error=Invalid%20order%20ID.");
  }

  const supabase = await createClient();
  const { data: order } = await supabase
    .from("offline_orders")
    .select("id, so_number")
    .eq("id", orderId)
    .single();

  if (!order) {
    redirect("/offline-orders?error=Offline%20order%20not%20found.");
  }

  const { data: attachments } = await supabase
    .from("offline_order_attachments")
    .select("storage_path")
    .eq("offline_order_id", orderId);

  const admin = createAdminClient();
  const { error } = await admin.from("offline_orders").delete().eq("id", orderId);
  if (error) {
    redirect(`/offline-orders/${orderId}?error=${encodeURIComponent(error.message)}`);
  }

  const storagePaths = (attachments ?? []).map((a) => a.storage_path).filter(Boolean);
  let cleanupWarning = "";
  if (storagePaths.length > 0) {
    const { error: storageError } = await admin.storage.from("offline-order-files").remove(storagePaths);
    if (storageError) {
      cleanupWarning = "?warning=Order%20deleted%2C%20but%20an%20administrator%20must%20clean%20up%20its%20stored%20files.";
    }
  }

  invalidateDashboardCache();
  revalidatePath("/");
  revalidatePath("/offline-orders");
  revalidatePath("/dispatch");
  revalidatePath("/tracking");
  redirect(`/offline-orders${cleanupWarning}`);
}

/**
 * Logistics or Admin marks an offline order delivery as unsuccessful, RTO, or assigns RTA re-dispatch.
 */
export async function markOfflineDeliveryUnsuccessfulAction(formData: FormData) {
  await requireProfile(["LOGISTICS", "ADMIN"]);
  const orderId = String(formData.get("order_id") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  const outcome = String(formData.get("outcome") ?? "").trim().toUpperCase();
  const isRta = outcome === "RTA" || formData.get("is_rta") === "true" || formData.get("is_rta") === "on";
  const newPartner = String(formData.get("logistics_partner") ?? "").trim();
  const newLrNumber = String(formData.get("lr_number") ?? "").trim();
  const newTrackingUrl = String(formData.get("tracking_url") ?? "").trim();
  const returnTo = String(formData.get("return_to") ?? "/tracking");

  if (!/^[0-9a-f-]{36}$/i.test(orderId)) {
    redirect(`${returnTo}?error=${encodeURIComponent("Invalid offline order.")}`);
  }

  if (isRta || (newPartner && newLrNumber)) {
    if (!newPartner) {
      redirect(`${returnTo}?error=${encodeURIComponent("New delivery partner is required for RTA re-assignment.")}`);
    }
    if (!newLrNumber) {
      redirect(`${returnTo}?error=${encodeURIComponent("New LR / tracking number is required for RTA re-assignment.")}`);
    }
    if (newTrackingUrl && !/^https?:\/\/[^\s]+$/i.test(newTrackingUrl)) {
      redirect(`${returnTo}?error=${encodeURIComponent("Tracking link must begin with http:// or https://")}`);
    }
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mark_offline_delivery_unsuccessful", {
    p_order_id: orderId,
    p_reason: reason || null,
    p_new_logistics_partner: newPartner || null,
    p_new_lr_number: newLrNumber || null,
    p_new_tracking_url: newTrackingUrl || null,
    p_outcome: outcome || (isRta ? "RTA" : null),
  });

  if (error) {
    redirect(`${returnTo}?error=${encodeURIComponent(error.message)}`);
  }

  const order = data as OfflineOrder;
  const isReassigned = Boolean(newPartner && newLrNumber);
  const msg = outcome === "RTO"
    ? `Offline order ${order?.so_number ?? ""} marked as RTO (Return to Origin).`
    : isReassigned
    ? `Offline order ${order?.so_number ?? ""} re-assigned (RTA) with ${newPartner}.`
    : `Offline order ${order?.so_number ?? ""} marked as delivery unsuccessful.`;

  invalidateDashboardCache();
  revalidatePath("/");
  revalidatePath("/offline-orders");
  revalidatePath("/tracking");
  revalidatePath(`/offline-orders/${orderId}`);
  redirect(`${returnTo}?success=${encodeURIComponent(msg)}`);
}

/**
 * Creates or edits reusable customer presets for offline orders.
 * HR, Boss, Customer Support, and Admin can manage presets.
 */
export async function saveCustomerPresetAction(formData: FormData) {
  const profile = await requireProfile(["HR", "BOSS", "CUSTOMER_SUPPORT", "ADMIN"]);
  const parsed = customerPresetSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(`/customers?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Check the customer details.")}`);
  }

  const supabase = await createClient();
  const values = {
    name: parsed.data.name,
    phone: parsed.data.phone ?? null,
    email: parsed.data.email ?? null,
    address: parsed.data.address,
    active: parsed.data.active ?? true,
  };

  const { error } = parsed.data.id
    ? await supabase.from("customer_presets").update(values).eq("id", parsed.data.id)
    : await supabase.from("customer_presets").insert({ ...values, created_by: profile.id });

  if (error) {
    redirect(`/customers?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/customers");
  revalidatePath("/offline-orders/new");
  redirect("/customers?success=Customer%20profile%20saved.");
}

/**
 * Archives a customer preset so it no longer appears in future selections.
 */
export async function archiveCustomerPresetAction(formData: FormData) {
  await requireProfile(["HR", "BOSS", "CUSTOMER_SUPPORT", "ADMIN"]);
  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    redirect("/customers?error=Invalid%20customer%20profile.");
  }

  const supabase = await createClient();
  const { error } = await supabase.from("customer_presets").update({ active: false }).eq("id", id);
  if (error) {
    redirect(`/customers?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/customers");
  revalidatePath("/offline-orders/new");
  redirect("/customers?success=Customer%20profile%20archived.");
}

