"use server";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasRole, invalidateProfileCache, requireProfile } from "@/lib/auth/session";
import { ALLOWED_MIME_TYPES, commentSchema, dimensionPresetSchema, MAX_FILE_SIZE, replacementEditSchema, replacementSchema, transitionSchema } from "@/lib/replacements/validation";
import { safeFileName } from "@/lib/utils";
import { notifyTelegram } from "@/lib/notifications/telegram";
import { verifyFileSignature } from "@/lib/security/magic-bytes";
import { checkRateLimit, resetRateLimit } from "@/lib/security/rate-limit";
import { ROLES, type AttachmentType, type Replacement, type Role } from "@/lib/types";

/**
 * Extracts a user-friendly error message string from an unknown caught error.
 */
function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Your change was not saved.";
}

/**
 * Extracts all non-empty File instances from FormData for a given field key.
 */
function formFiles(formData: FormData, key: string): File[] {
  return formData.getAll(key).filter((value): value is File => value instanceof File && value.size > 0);
}

/**
 * Validates uploaded files against size constraints, allowed MIME types,
 * and genuine binary magic byte signatures (preventing file spoofing).
 *
 * @param files - List of files to validate
 * @param documentsAllowed - When false, restricts uploads strictly to images (e.g. for QC)
 */
async function validateFiles(files: File[], documentsAllowed = true): Promise<void> {
  for (const file of files) {
    if (file.size > MAX_FILE_SIZE) throw new Error(`${file.name} is larger than 25 MB.`);
    if (!ALLOWED_MIME_TYPES.has(file.type)) throw new Error(`${file.name} is not a supported file type.`);
    if (!documentsAllowed && file.type === "application/pdf") throw new Error("QC uploads must be JPEG, PNG, or WebP images.");
    const validSignature = await verifyFileSignature(file);
    if (!validSignature) throw new Error(`${file.name} is corrupted or has an unrecognized file header.`);
  }
}

/**
 * Uploads a batch of files directly to Supabase Storage ('replacement-files')
 * under an isolated directory path and returns metadata rows for the database.
 * Rolls back any partially uploaded storage files if a subsequent upload fails.
 */
async function uploadFiles(
  replacementId: string,
  files: File[],
  type: AttachmentType,
  folder: string,
  qcSubmissionId?: string,
) {
  const profile = await requireProfile();
  const supabase = await createClient();
  const uploaded: string[] = [];
  const rows = [];
  for (const file of files) {
    const path = `replacements/${replacementId}/${folder}/${randomUUID()}-${safeFileName(file.name)}`;
    const { error } = await supabase.storage.from("replacement-files").upload(path, file, {
      contentType: file.type,
      upsert: false,
    });
    if (error) {
      if (uploaded.length) await supabase.storage.from("replacement-files").remove(uploaded);
      throw new Error(`Could not upload ${file.name}. Try again.`);
    }
    uploaded.push(path);
    rows.push({
      replacement_id: replacementId,
      qc_submission_id: qcSubmissionId ?? null,
      attachment_type: type,
      storage_path: path,
      file_name: safeFileName(file.name),
      mime_type: file.type,
      uploaded_by: profile.id,
    });
  }
  return { rows, uploaded };
}

/** Removes orphaned uploads only after proving that no committed attachment references them. */
async function cleanupUncommittedUploads(
  supabase: Awaited<ReturnType<typeof createClient>>,
  uploaded: string[],
) {
  if (!uploaded.length) return;
  const { count, error } = await supabase
    .from("attachments")
    .select("id", { count: "exact", head: true })
    .in("storage_path", uploaded);
  if (!error && count === 0) {
    await supabase.storage.from("replacement-files").remove(uploaded);
  }
}

/**
 * Handles user authentication via email and password.
 * Protected by sliding-window IP rate limiting (max 5 failed attempts per 15 minutes).
 */
export async function loginAction(formData: FormData) {
  const reqHeaders = await headers();
  const ip = reqHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || reqHeaders.get("x-real-ip") || "unknown";
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  const rateLimitKey = `login:${ip}:${email}`;
  const rate = checkRateLimit(rateLimitKey, 5, 15 * 60 * 1000);
  if (!rate.allowed) {
    const waitMinutes = Math.ceil(rate.retryAfterSeconds / 60);
    redirect(`/login?error=${encodeURIComponent(`Too many failed login attempts. Please wait ${waitMinutes} minute${waitMinutes > 1 ? "s" : ""}.`)}`);
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) redirect(`/login?error=${encodeURIComponent(error.message || "Email or password is incorrect.")}`);
    resetRateLimit(rateLimitKey);
  } catch (err) {
    redirect(`/login?error=${encodeURIComponent(messageFrom(err))}`);
  }
  redirect("/");
}

/**
 * Signs out the current user session and redirects to the login screen.
 */
export async function logoutAction() {
  invalidateProfileCache();
  if (isSupabaseConfigured()) {
    try {
      const supabase = await createClient();
      await supabase.auth.signOut();
    } catch {
      // Ignore network errors on signout
    }
  }
  redirect("/login");
}

/**
 * Creates a new replacement order with CUSTOMER_SUPPORT's product photos.
 *
 * Authorization: CUSTOMER_SUPPORT or ADMIN
 * Workflow:
 * 1. Validates form fields (order reference, product, quantity, etc.).
 * 2. Uploads one to twelve product photos into private storage.
 * 3. Atomically creates the order and attachment metadata through PostgreSQL.
 * 4. Notifies Logistics that the shipping label is required.
 */
export async function createReplacementAction(formData: FormData) {
  const profile = await requireProfile(["CUSTOMER_SUPPORT", "ADMIN"]);
  const parsed = replacementSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`/replacements/new?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Check the form.")}`);

  const photos = formFiles(formData, "product_photos");
  if (!photos.length || photos.length > 12) {
    redirect(`/replacements/new?error=${encodeURIComponent("Add between one and twelve product photos.")}`);
  }
  if (photos.reduce((sum, file) => sum + file.size, 0) > 80 * 1024 * 1024) {
    redirect(`/replacements/new?error=${encodeURIComponent("The combined product photos must be 80 MB or smaller.")}`);
  }
  try {
    await validateFiles(photos, false);
  } catch (error) {
    redirect(`/replacements/new?error=${encodeURIComponent(messageFrom(error))}`);
  }

  const replacementId = randomUUID();
  const uploadId = randomUUID();
  const supabase = await createClient();
  const uploaded: string[] = [];
  let replacement: Replacement | null = null;
  try {
    const photoUpload = await uploadFiles(replacementId, photos, "PROOF_PHOTO", `CUSTOMER_SUPPORT/${uploadId}/photos`);
    uploaded.push(...photoUpload.uploaded);
    const { data, error } = await supabase.rpc("create_replacement_with_photos", {
      p_replacement_id: replacementId,
      p_upload_id: uploadId,
      p_order_reference: parsed.data.order_reference,
      p_customer_name: parsed.data.customer_name,
      p_customer_reference: parsed.data.customer_reference,
      p_product_name: parsed.data.product_name,
      p_quantity: parsed.data.quantity,
      p_reason: parsed.data.reason,
      p_notes: parsed.data.notes,
      p_tracking_url: parsed.data.tracking_url,
      p_attachments: photoUpload.rows,
    });
    if (error || !data) throw error ?? new Error("Could not create replacement.");
    replacement = data as Replacement;
  } catch (error) {
    await cleanupUncommittedUploads(supabase, uploaded);
    redirect(`/replacements/new?error=${encodeURIComponent(messageFrom(error))}`);
  }

  const sent = await notifyTelegram("NEW_REPLACEMENT", replacement!, undefined, profile.full_name);
  const warning = sent.ok ? "" : "Replacement created, but a Telegram notification could not be sent.";
  redirect(`/replacements/${replacement!.id}${warning ? `?warning=${encodeURIComponent(warning)}` : ""}`);
}

/** Creates one or more replacement/offline orders while keeping every order independently traceable. */
export async function createOrderBatchAction(formData: FormData) {
  const profile = await requireProfile(["CUSTOMER_SUPPORT", "ADMIN"]);
  let rawOrders: unknown;
  try {
    rawOrders = JSON.parse(String(formData.get("orders_manifest") ?? "null"));
  } catch {
    redirect(`/replacements/new?error=${encodeURIComponent("The order form is invalid. Refresh and try again.")}`);
  }
  if (!Array.isArray(rawOrders) || rawOrders.length < 1 || rawOrders.length > 20) {
    redirect(`/replacements/new?error=${encodeURIComponent("Create between one and twenty orders at a time.")}`);
  }

  const parsedOrders = rawOrders.map((raw) => replacementSchema.safeParse(raw));
  const invalid = parsedOrders.find((result) => !result.success);
  if (invalid && !invalid.success) {
    redirect(`/replacements/new?error=${encodeURIComponent(invalid.error.issues[0]?.message ?? "Check every order.")}`);
  }
  const requestedOrderNumbers = rawOrders.map((raw) => {
    const rawVal = (raw as { requested_order_number?: unknown }).requested_order_number;
    if (rawVal === undefined || rawVal === null || rawVal === "") return null;
    const value = Number(rawVal);
    return Number.isSafeInteger(value) && value >= 1 ? value : null;
  });
  if (rawOrders.some((raw, idx) => {
    const rawVal = (raw as { requested_order_number?: unknown }).requested_order_number;
    return rawVal !== undefined && rawVal !== null && rawVal !== "" && requestedOrderNumbers[idx] === null;
  })) {
    redirect(`/replacements/new?error=${encodeURIComponent("Order ID must be a positive whole number.")}`);
  }
  const requestedValues = requestedOrderNumbers.filter((value): value is number => value !== null);
  if (new Set(requestedValues).size !== requestedValues.length) {
    redirect(`/replacements/new?error=${encodeURIComponent("Order IDs must be unique within this batch.")}`);
  }

  const localIds = rawOrders.map((raw) => String((raw as { id?: unknown }).id ?? ""));
  if (new Set(localIds).size !== localIds.length || localIds.some((id) => !/^[a-zA-Z0-9:_-]{1,100}$/.test(id))) {
    redirect(`/replacements/new?error=${encodeURIComponent("The order form contains an invalid item.")}`);
  }

  const idMap = new Map(localIds.map((id) => [id, randomUUID()]));
  const filesByOrder = localIds.map((localId) => ({
    localId,
    replacementId: idMap.get(localId)!,
    files: formFiles(formData, `product_photos:${localId}`),
  }));
  if (filesByOrder.some(({ files }) => files.length < 1 || files.length > 12)) {
    redirect(`/replacements/new?error=${encodeURIComponent("Add between one and twelve product photos for every order.")}`);
  }
  if (filesByOrder.some(({ files }) => files.reduce((sum, file) => sum + file.size, 0) > 80 * 1024 * 1024)) {
    redirect(`/replacements/new?error=${encodeURIComponent("Each order's combined product photos must be 80 MB or smaller.")}`);
  }
  const batchBytes = filesByOrder.flatMap(({ files }) => files).reduce((sum, file) => sum + file.size, 0);
  if (batchBytes > 90 * 1024 * 1024) {
    redirect(`/replacements/new?error=${encodeURIComponent("The complete batch of photos must be 90 MB or smaller. Submit fewer orders at once.")}`);
  }
  try {
    await Promise.all(filesByOrder.map(({ files }) => validateFiles(files, false)));
  } catch (error) {
    redirect(`/replacements/new?error=${encodeURIComponent(messageFrom(error))}`);
  }

  const supabase = await createClient();
  const uploaded: string[] = [];
  const attachmentRows: Array<Record<string, unknown>> = [];
  let created: Replacement[] = [];
  try {
    for (const item of filesByOrder) {
      const uploadId = randomUUID();
      const result = await uploadFiles(item.replacementId, item.files, "PROOF_PHOTO", `CUSTOMER_SUPPORT/${uploadId}/photos`);
      uploaded.push(...result.uploaded);
      attachmentRows.push(...result.rows);
    }
    const orders = parsedOrders.map((result, index) => ({
      ...(result.success ? result.data : {}),
      id: idMap.get(localIds[index]),
      requested_order_number: requestedOrderNumbers[index],
      tracking_url: null,
    }));
    const { data, error } = await supabase.rpc("create_order_batch", {
      p_group_id: orders.length > 1 ? randomUUID() : null,
      p_orders: orders,
      p_attachments: attachmentRows,
    });
    if (error || !data?.length) throw error ?? new Error("Could not create orders.");
    created = data as Replacement[];
  } catch (error) {
    await cleanupUncommittedUploads(supabase, uploaded);
    redirect(`/replacements/new?error=${encodeURIComponent(messageFrom(error))}`);
  }

  const notices = await Promise.all(created.map((order) => notifyTelegram("NEW_REPLACEMENT", order, undefined, profile.full_name)));
  const warning = notices.some((notice) => !notice.ok) ? "Orders were created, but a Telegram notification could not be sent." : "";
  redirect(`/replacements/${created[0].id}?success=${encodeURIComponent(`${created.length} order${created.length === 1 ? "" : "s"} created.`)}${warning ? `&warning=${encodeURIComponent(warning)}` : ""}`);
}

/**
 * Updates editable order details (customer name, product, quantity, reason, notes).
 *
 * Authorization: CUSTOMER_SUPPORT or ADMIN
 * Calls database RPC function `update_replacement_details` which logs changes
 * to `activity_logs` and enforces edit constraints.
 */
export async function updateReplacementAction(formData: FormData) {
  await requireProfile(["CUSTOMER_SUPPORT", "HR", "BOSS", "ADMIN"]);
  const replacementId = String(formData.get("replacement_id") ?? "");
  const parsed = replacementEditSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`/replacements/${replacementId}/edit?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Check the form.")}`);
  let requestedOrderNumber: number | null = null;
  const rawOrderNum = formData.get("order_number");
  if (rawOrderNum !== null && rawOrderNum !== "") {
    requestedOrderNumber = Number(rawOrderNum);
    if (!Number.isSafeInteger(requestedOrderNumber) || requestedOrderNumber < 1) {
      redirect(`/replacements/${replacementId}/edit?error=${encodeURIComponent("Order ID must be a positive whole number.")}`);
    }
  }
  const supabase = await createClient();
  const { data: current } = await supabase.from("replacements").select("tracking_url").eq("id", replacementId).single();
  const { error } = await supabase.rpc("update_replacement_details_with_order_number", {
    p_replacement_id: replacementId,
    p_order_number: requestedOrderNumber,
    p_order_reference: parsed.data.order_reference,
    p_customer_name: parsed.data.customer_name,
    p_customer_reference: null,
    p_product_name: parsed.data.product_name,
    p_quantity: parsed.data.quantity,
    p_reason: parsed.data.reason,
    p_notes: parsed.data.notes,
    p_tracking_url: current?.tracking_url ?? null,
  });
  if (error) redirect(`/replacements/${replacementId}/edit?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/replacements/${replacementId}`);
  redirect(`/replacements/${replacementId}`);
}

/** Moves completed orders older than 30 days out of live queues while retaining their audit history. */
export async function archiveCompletedReplacementsAction() {
  await requireProfile(["ADMIN"]);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("archive_completed_replacements");
  if (error) redirect(`/replacements?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/");
  revalidatePath("/replacements");
  revalidatePath("/dispatch");
  redirect(`/replacements?scope=archived&success=${encodeURIComponent(`${data ?? 0} completed order${data === 1 ? "" : "s"} archived.`)}`);
}

const notificationForStatus = {
  LABEL_PRINTED: "LABEL_PRINTED",
  QC_APPROVED: "QC_APPROVED",
  QC_REJECTED: "QC_REJECTED",
  PACKED: "PACKED",
  SHIPPED: "SHIPPED",
  DELIVERED: "DELIVERED",
  NEEDS_TOKEN: "NEEDS_TOKEN",
} as const;

/**
 * Transitions a replacement order to a target operational status.
 *
 * Authorization: Enforced atomically inside PostgreSQL via `transition_replacement` RPC:
 * - PRINTING: Can mark an uploaded label as printed.
 * - CUSTOMER_SUPPORT: Can review QC (QC_APPROVED / QC_REJECTED).
 * - PACKING: Can pack approved orders and finish dispatch (SHIPPED, NEEDS_TOKEN).
 * - ADMIN: Can execute all standard transitions or cancel.
 *
 * Triggers automated Telegram notifications for the target status and revalidates cache.
 */
export async function transitionAction(formData: FormData) {
  await requireProfile();
  const parsed = transitionSchema.safeParse(Object.fromEntries(formData));
  const fallbackId = String(formData.get("replacement_id") ?? "");
  if (!parsed.success) redirect(`/replacements/${fallbackId}?error=${encodeURIComponent("Invalid action.")}`);
  if (parsed.data.target_status === "QC_REJECTED" && !parsed.data.message) {
    redirect(`/replacements/${parsed.data.replacement_id}?error=${encodeURIComponent("A rejection reason is required.")}`);
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("transition_replacement", {
    p_replacement_id: parsed.data.replacement_id,
    p_target_status: parsed.data.target_status,
    p_message: parsed.data.message ?? null,
  });
  if (error) redirect(`/replacements/${parsed.data.replacement_id}?error=${encodeURIComponent(error.message)}`);
  const replacement = data as Replacement;
  const type = notificationForStatus[parsed.data.target_status as keyof typeof notificationForStatus];
  const sent = type ? await notifyTelegram(type, replacement, parsed.data.message) : { ok: true };
  revalidatePath("/");
  revalidatePath("/replacements");
  revalidatePath("/tracking");
  revalidatePath(`/replacements/${parsed.data.replacement_id}`);
  redirect(`/replacements/${parsed.data.replacement_id}${!sent.ok ? "?warning=Updated%2C%20but%20Telegram%20notification%20failed." : ""}`);
}

/**
 * Uploads Logistics' shipping label, then hands the order to Printing.
 *
 * Authorization: LOGISTICS or ADMIN
 * Workflow:
 * The database verifies the storage object and atomically records the label
 * before changing the order from NEW to LABEL_UPLOADED.
 */
export async function submitLogisticsAction(formData: FormData) {
  await requireProfile(["LOGISTICS", "ADMIN"]);
  const replacementId = String(formData.get("replacement_id") ?? "");
  const labels = formFiles(formData, "labels");
  const courierPartner = String(formData.get("courier_partner") ?? "").trim();
  const trackingId = String(formData.get("tracking_id") ?? "").trim();
  const trackingUrl = String(formData.get("tracking_url") ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(replacementId)) redirect("/replacements?error=Invalid%20replacement.");
  if (labels.length !== 1) redirect(`/replacements/${replacementId}?error=${encodeURIComponent("Add exactly one shipping label.")}`);
  try {
    await validateFiles(labels);
  } catch (error) {
    redirect(`/replacements/${replacementId}?error=${encodeURIComponent(messageFrom(error))}`);
  }

  const uploadId = randomUUID();
  const supabase = await createClient();
  const uploaded: string[] = [];
  let replacement: Replacement | null = null;
  try {
    const labelUpload = await uploadFiles(replacementId, labels, "LABEL", `logistics/${uploadId}/labels`);
    uploaded.push(...labelUpload.uploaded);
    const { data, error } = await supabase.rpc("submit_logistics_label", {
      p_replacement_id: replacementId,
      p_upload_id: uploadId,
      p_tracking_url: trackingUrl || null,
      p_attachments: labelUpload.rows,
      p_courier_partner: courierPartner || null,
      p_tracking_id: trackingId || null,
    });
    if (error) throw error;
    replacement = data as Replacement;
  } catch (error) {
    await cleanupUncommittedUploads(supabase, uploaded);
    redirect(`/replacements/${replacementId}?error=${encodeURIComponent(messageFrom(error))}`);
  }
  const sent = await notifyTelegram("LABEL_UPLOADED", replacement!);
  revalidatePath(`/replacements/${replacementId}`);
  revalidatePath("/");
  revalidatePath("/replacements");
  redirect(`/replacements/${replacementId}${!sent.ok ? "?warning=Files%20saved%2C%20but%20Telegram%20notification%20failed." : ""}`);
}

/** Uploads Packing's QC photos and asks CUSTOMER_SUPPORT to approve or reject the order. */
export async function submitPackingQcAction(formData: FormData) {
  await requireProfile(["PACKING", "ADMIN"]);
  const replacementId = String(formData.get("replacement_id") ?? "");
  const photos = formFiles(formData, "qc_photos");
  if (!/^[0-9a-f-]{36}$/i.test(replacementId)) redirect("/replacements?error=Invalid%20replacement.");
  if (!photos.length || photos.length > 12) {
    redirect(`/replacements/${replacementId}?error=${encodeURIComponent("Add between one and twelve QC photos.")}`);
  }
  const totalUploadBytes = photos.reduce((sum, file) => sum + file.size, 0);
  if (totalUploadBytes > 80 * 1024 * 1024) {
    redirect(`/replacements/${replacementId}?error=${encodeURIComponent("The combined upload must be 80 MB or smaller.")}`);
  }
  try {
    await validateFiles(photos, false);
  } catch (error) {
    redirect(`/replacements/${replacementId}?error=${encodeURIComponent(messageFrom(error))}`);
  }

  const submissionId = randomUUID();
  const supabase = await createClient();
  const uploaded: string[] = [];
  let replacement: Replacement | null = null;
  try {
    const photoUpload = await uploadFiles(
      replacementId,
      photos,
      "QC_PHOTO",
      `packing/${submissionId}/photos`,
      submissionId,
    );
    uploaded.push(...photoUpload.uploaded);
    const { data, error } = await supabase.rpc("submit_packing_qc", {
      p_replacement_id: replacementId,
      p_submission_id: submissionId,
      p_attachments: photoUpload.rows,
    });
    if (error) throw error;
    replacement = data as Replacement;
  } catch (error) {
    await cleanupUncommittedUploads(supabase, uploaded);
    redirect(`/replacements/${replacementId}?error=${encodeURIComponent(messageFrom(error))}`);
  }
  const sent = await notifyTelegram("QC_SUBMITTED", replacement!);
  revalidatePath(`/replacements/${replacementId}`);
  revalidatePath("/");
  revalidatePath("/replacements");
  redirect(`/replacements/${replacementId}${!sent.ok ? "?warning=QC%20submitted%2C%20but%20Telegram%20notification%20failed." : ""}`);
}

/**
 * Administrator emergency override to force a replacement into any valid lifecycle status.
 *
 * Authorization: ADMIN only
 * Requires a mandatory reason which is recorded in the activity audit log via
 * the `admin_override_replacement` database RPC function.
 */
export async function adminOverrideAction(formData: FormData) {
  await requireProfile(["ADMIN"]);
  const replacementId = String(formData.get("replacement_id") ?? "");
  const target = String(formData.get("target_status") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason || !["NEW", "LABEL_UPLOADED", "LABEL_PRINTED", "QC_PENDING", "QC_REJECTED", "QC_APPROVED", "PACKED", "SHIPPED", "NEEDS_TOKEN", "CANCELLED"].includes(target)) {
    redirect(`/replacements/${replacementId}?error=${encodeURIComponent("An override status and reason are required.")}`);
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_override_replacement", { p_replacement_id: replacementId, p_target_status: target, p_reason: reason });
  if (error) redirect(`/replacements/${replacementId}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/replacements/${replacementId}`);
  revalidatePath("/");
  redirect(`/replacements/${replacementId}`);
}

/**
 * Appends an operational or support comment to a replacement order.
 *
 * Authorization: Authenticated users of any active operational role.
 * Persists the comment and logs an entry to the order timeline via the `add_replacement_comment` RPC.
 */
export async function addCommentAction(formData: FormData) {
  await requireProfile();
  const parsed = commentSchema.safeParse(Object.fromEntries(formData));
  const replacementId = String(formData.get("replacement_id") ?? "");
  if (!parsed.success) redirect(`/replacements/${replacementId}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid comment.")}`);
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_replacement_comment", { p_replacement_id: parsed.data.replacement_id, p_message: parsed.data.message });
  if (error) redirect(`/replacements/${replacementId}?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/replacements/${replacementId}`);
}

/**
 * Creates a new user profile and Supabase Auth credentials.
 *
 * Authorization: ADMIN only
 * Generates an email-confirmed auth user with initial metadata and a minimum 6-character password.
 */
export async function createUserAction(formData: FormData) {
  await requireProfile(["ADMIN"]);
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const temporaryPassword = String(formData.get("temporary_password") ?? "");
  const rawRoles = formData
    .getAll("roles")
    .map(String)
    .filter((r): r is Role => (ROLES as readonly string[]).includes(r));
  const fallbackRole = String(formData.get("role") ?? "") as Role;
  const roles = rawRoles.length > 0
    ? rawRoles
    : (ROLES as readonly string[]).includes(fallbackRole)
      ? [fallbackRole]
      : [];
  const primaryRole = roles[0] ?? fallbackRole;

  if (!email || !fullName || temporaryPassword.length < 6 || roles.length === 0) {
    redirect("/admin/users?error=Use%20a%20valid%20lowercase%20email%2C%20select%20at%20least%20one%20role%2C%20and%20use%20a%20temporary%20password%20of%20at%20least%206%20characters.");
  }
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error || !data.user) redirect(`/admin/users?error=${encodeURIComponent(error?.message ?? "Could not create user.")}`);
  const { error: profileError } = await admin
    .from("profiles")
    .update({ role: primaryRole, roles, active: true })
    .eq("id", data.user.id);
  if (profileError) {
    await admin.auth.admin.deleteUser(data.user.id);
    redirect(`/admin/users?error=${encodeURIComponent(profileError.message)}`);
  }
  revalidatePath("/admin/users");
  redirect("/admin/users?success=User%20created.%20Share%20the%20temporary%20password%20securely.");
}

/**
 * Updates a user's display name, operational role, and active status.
 *
 * Authorization: ADMIN only
 * Enables or disables account access and updates permissions in the `profiles` table.
 */
export async function updateUserAction(formData: FormData) {
  const actor = await requireProfile(["ADMIN"]);
  const id = String(formData.get("id") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim();
  const rawRoles = formData
    .getAll("roles")
    .map(String)
    .filter((r): r is Role => (ROLES as readonly string[]).includes(r));
  const fallbackRole = String(formData.get("role") ?? "") as Role;
  const roles = rawRoles.length > 0
    ? rawRoles
    : (ROLES as readonly string[]).includes(fallbackRole)
      ? [fallbackRole]
      : [];
  const primaryRole = roles[0] ?? fallbackRole;
  const active = formData.get("active") === "true";

  if (!/^[0-9a-f-]{36}$/i.test(id) || !fullName || fullName.length > 120 || roles.length === 0) {
    redirect("/admin/users?error=Invalid%20user%20update.");
  }
  if (id === actor.id && (!active || !roles.includes("ADMIN"))) {
    redirect("/admin/users?error=You%20cannot%20remove%20your%20own%20active%20administrator%20access.");
  }
  const admin = createAdminClient();
  const { data: authRecord, error: authReadError } = await admin.auth.admin.getUserById(id);
  if (authReadError || !authRecord.user) redirect(`/admin/users?error=${encodeURIComponent(authReadError?.message ?? "Could not load the Auth user.")}`);
  const { error } = await admin
    .from("profiles")
    .update({ full_name: fullName, role: primaryRole, roles, active })
    .eq("id", id);
  if (error) redirect(`/admin/users?error=${encodeURIComponent(error.message)}`);
  const { error: authError } = await admin.auth.admin.updateUserById(id, {
    user_metadata: { ...authRecord.user.user_metadata, full_name: fullName },
  });
  if (authError) redirect(`/admin/users?error=${encodeURIComponent(`Profile name was saved, but Auth metadata could not be updated: ${authError.message}`)}`);
  invalidateProfileCache();
  revalidatePath("/admin/users");
}

/**
 * Updates the current authenticated user's account password.
 *
 * Authorization: Current authenticated user.
 * Validates password match and enforces the app's minimum 6-character password policy.
 */
export async function updatePasswordAction(formData: FormData) {
  await requireProfile();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirm_password") ?? "");
  if (password.length < 6 || password !== confirmPassword) redirect("/profile?error=Passwords%20must%20match%20and%20be%20at%20least%206%20characters.");
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) redirect(`/profile?error=${encodeURIComponent(error.message)}`);
  redirect("/profile?success=Password%20updated.");
}

/** Creates or edits reusable centimetre dimensions. Customer Support and Admin share this responsibility. */
export async function saveDimensionPresetAction(formData: FormData) {
  const profile = await requireProfile(["CUSTOMER_SUPPORT", "ADMIN"]);
  const parsed = dimensionPresetSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`/dimensions?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Check the dimensions.")}`);
  const supabase = await createClient();
  const values = {
    name: parsed.data.name,
    length_cm: parsed.data.length_cm,
    breadth_cm: parsed.data.breadth_cm,
    height_cm: parsed.data.height_cm,
    active: true,
  };
  const { error } = parsed.data.id
    ? await supabase.from("dimension_presets").update(values).eq("id", parsed.data.id)
    : await supabase.from("dimension_presets").insert({ ...values, created_by: profile.id });
  if (error) redirect(`/dimensions?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/dimensions");
  revalidatePath("/replacements/new");
  redirect("/dimensions?success=Dimension%20preset%20saved.");
}

/** Retires a preset without breaking old orders that reference its captured measurements. */
export async function archiveDimensionPresetAction(formData: FormData) {
  await requireProfile(["CUSTOMER_SUPPORT", "ADMIN"]);
  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) redirect("/dimensions?error=Invalid%20dimension%20preset.");
  const supabase = await createClient();
  const { error } = await supabase.from("dimension_presets").update({ active: false }).eq("id", id);
  if (error) redirect(`/dimensions?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/dimensions");
  revalidatePath("/replacements/new");
  redirect("/dimensions?success=Dimension%20preset%20archived.");
}

/**
 * Permanently deletes a replacement order and cleans up all associated storage files.
 *
 * Authorization:
 * - ADMIN: Can delete any order at any status.
 * - CUSTOMER_SUPPORT: Can delete only orders they personally created, and only while status is still 'NEW'.
 *
 * Deletes the database record first so a database failure cannot leave an order
 * pointing at missing evidence, then performs best-effort privileged file cleanup.
 */
export async function deleteReplacementAction(formData: FormData) {
  const profile = await requireProfile(["ADMIN", "CUSTOMER_SUPPORT"]);
  const replacementId = String(formData.get("replacement_id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(replacementId)) {
    redirect("/replacements?error=Invalid%20replacement%20ID.");
  }

  const supabase = await createClient();
  const { data: replacement } = await supabase
    .from("replacements")
    .select("id, status, created_by, replacement_number")
    .eq("id", replacementId)
    .single();

  if (!replacement) {
    redirect("/replacements?error=Replacement%20not%20found.");
  }

  if (!hasRole(profile, "ADMIN") && (replacement.created_by !== profile.id || replacement.status !== "NEW")) {
    redirect(`/replacements/${replacementId}?error=You%20can%20only%20delete%20new%20orders%20you%20created.`);
  }

  const { data: attachments } = await supabase
    .from("attachments")
    .select("storage_path")
    .eq("replacement_id", replacementId);

  const admin = createAdminClient();
  const { error } = await admin.from("replacements").delete().eq("id", replacementId);
  if (error) {
    redirect(`/replacements/${replacementId}?error=${encodeURIComponent(error.message)}`);
  }

  const storagePaths = (attachments ?? []).map((a) => a.storage_path).filter(Boolean);
  let cleanupWarning = "";
  if (storagePaths.length > 0) {
    const { error: storageError } = await admin.storage.from("replacement-files").remove(storagePaths);
    if (storageError) cleanupWarning = "?warning=Order%20deleted%2C%20but%20an%20administrator%20must%20clean%20up%20its%20stored%20files.";
  }

  revalidatePath("/");
  revalidatePath("/replacements");
  revalidatePath("/dispatch");
  redirect(`/replacements${cleanupWarning}`);
}
