"use server";

import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile } from "@/lib/auth/session";
import { ALLOWED_MIME_TYPES, commentSchema, MAX_FILE_SIZE, replacementSchema, transitionSchema } from "@/lib/replacements/validation";
import { safeFileName } from "@/lib/utils";
import { notifyTelegram } from "@/lib/notifications/telegram";
import { verifyFileSignature } from "@/lib/security/magic-bytes";
import { checkRateLimit, resetRateLimit } from "@/lib/security/rate-limit";
import type { AttachmentType, Replacement, Role } from "@/lib/types";

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

/**
 * Handles user authentication via email and password.
 * Protected by sliding-window IP rate limiting (max 5 failed attempts per 15 minutes).
 */
export async function loginAction(formData: FormData) {
  const reqHeaders = await headers();
  const ip = reqHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || reqHeaders.get("x-real-ip") || "unknown";
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const rateLimitKey = `login:${ip}:${email}`;
  const rate = checkRateLimit(rateLimitKey, 5, 15 * 60 * 1000);
  if (!rate.allowed) {
    const waitMinutes = Math.ceil(rate.retryAfterSeconds / 60);
    redirect(`/login?error=${encodeURIComponent(`Too many failed login attempts. Please wait ${waitMinutes} minute${waitMinutes > 1 ? "s" : ""}.`)}`);
  }

  const password = String(formData.get("password") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) redirect(`/login?error=${encodeURIComponent(error.message || "Email or password is incorrect.")}`);
  resetRateLimit(rateLimitKey);
  redirect("/");
}

/**
 * Signs out the current user session and redirects to the login screen.
 */
export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/**
 * Creates a new replacement order and uploads associated customer photos and shipping labels.
 *
 * Authorization: ESHA or ADMIN
 * Workflow:
 * 1. Validates form fields (order reference, product, quantity, etc.).
 * 2. Validates files for MIME type, size limit, and binary file signatures.
 * 3. Inserts the row into `replacements` table with status 'NEW'.
 * 4. Generates formatted sequence number (REP-YYYY-XXXX) via database trigger.
 * 5. Uploads customer photos and shipping label documents to Supabase Storage.
 * 6. Dispatches 'NEW_REPLACEMENT' Telegram notification to printing department.
 */
export async function createReplacementAction(formData: FormData) {
  const profile = await requireProfile(["ESHA", "ADMIN"]);
  const parsed = replacementSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`/replacements/new?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Check the form.")}`);

  const customerPhotos = formFiles(formData, "customer_photos");
  const labels = formFiles(formData, "labels");
  try {
    await validateFiles(customerPhotos, false);
    await validateFiles(labels);
  } catch (error) {
    redirect(`/replacements/new?error=${encodeURIComponent(messageFrom(error))}`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.from("replacements").insert({ ...parsed.data, created_by: profile.id }).select("*").single();
  if (error || !data) redirect(`/replacements/new?error=${encodeURIComponent(error?.message ?? "Could not create replacement.")}`);
  const replacement = data as Replacement;

  let warning = "";
  let uploadedPaths: string[] = [];
  try {
    const customer = await uploadFiles(replacement.id, customerPhotos, "CUSTOMER_PHOTO", "customer");
    uploadedPaths = [...customer.uploaded];
    const label = await uploadFiles(replacement.id, labels, "LABEL", "labels");
    uploadedPaths.push(...label.uploaded);
    const rows = [...customer.rows, ...label.rows];
    if (rows.length) {
      const { error: attachmentError } = await supabase.from("attachments").insert(rows);
      if (attachmentError) {
        await supabase.storage.from("replacement-files").remove([...customer.uploaded, ...label.uploaded]);
        throw attachmentError;
      }
    }
  } catch (error) {
    if (uploadedPaths.length) await supabase.storage.from("replacement-files").remove(uploadedPaths);
    warning = messageFrom(error);
  }
  const sent = await notifyTelegram("NEW_REPLACEMENT", replacement, undefined, profile.full_name);
  if (!sent.ok) warning = warning || "Replacement created, but a Telegram notification could not be sent.";
  redirect(`/replacements/${replacement.id}${warning ? `?warning=${encodeURIComponent(warning)}` : ""}`);
}

/**
 * Updates editable order details (customer name, product, quantity, reason, notes).
 *
 * Authorization: ESHA or ADMIN
 * Calls database RPC function `update_replacement_details` which logs changes
 * to `activity_logs` and enforces edit constraints.
 */
export async function updateReplacementAction(formData: FormData) {
  await requireProfile(["ESHA", "ADMIN"]);
  const replacementId = String(formData.get("replacement_id") ?? "");
  const parsed = replacementSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect(`/replacements/${replacementId}/edit?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Check the form.")}`);
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_replacement_details", {
    p_replacement_id: replacementId,
    p_order_reference: parsed.data.order_reference,
    p_customer_name: parsed.data.customer_name,
    p_customer_reference: parsed.data.customer_reference,
    p_product_name: parsed.data.product_name,
    p_quantity: parsed.data.quantity,
    p_reason: parsed.data.reason,
    p_notes: parsed.data.notes,
  });
  if (error) redirect(`/replacements/${replacementId}/edit?error=${encodeURIComponent(error.message)}`);
  revalidatePath(`/replacements/${replacementId}`);
  redirect(`/replacements/${replacementId}`);
}

const notificationForStatus = {
  LABEL_PRINTED: "LABEL_PRINTED",
  QC_APPROVED: "QC_APPROVED",
  QC_REJECTED: "QC_REJECTED",
  PACKED: "PACKED",
  SHIPPED: "SHIPPED",
  NEEDS_TOKEN: "NEEDS_TOKEN",
} as const;

/**
 * Transitions a replacement order to a target operational status.
 *
 * Authorization: Enforced atomically inside PostgreSQL via `transition_replacement` RPC:
 * - PRINTING: Can mark LABEL_PRINTED (from NEW).
 * - ESHA: Can review QC (QC_APPROVED / QC_REJECTED) and dispatch (SHIPPED, NEEDS_TOKEN).
 * - PACKING: Can mark PACKED (only after QC_APPROVED).
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
  revalidatePath(`/replacements/${parsed.data.replacement_id}`);
  redirect(`/replacements/${parsed.data.replacement_id}${!sent.ok ? "?warning=Updated%2C%20but%20Telegram%20notification%20failed." : ""}`);
}

/**
 * Submits quality check (QC) photos taken by the packing department.
 *
 * Authorization: PACKING or ADMIN
 * Workflow:
 * 1. Validates image count (1-12) and checks binary file signatures.
 * 2. Uploads photos to storage under `replacements/{id}/qc/{submissionId}`.
 * 3. Calls `submit_qc` RPC function to atomically create submission record
 *    and transition order status to 'QC_PENDING'.
 * 4. Notifies ESHA via Telegram for review.
 */
export async function submitQcAction(formData: FormData) {
  await requireProfile(["PACKING", "ADMIN"]);
  const replacementId = String(formData.get("replacement_id") ?? "");
  const files = formFiles(formData, "qc_photos");
  if (!/^[0-9a-f-]{36}$/i.test(replacementId)) redirect("/replacements?error=Invalid%20replacement.");
  if (!files.length) redirect(`/replacements/${replacementId}?error=${encodeURIComponent("Add at least one QC photo.")}`);
  try {
    await validateFiles(files, false);
  } catch (error) {
    redirect(`/replacements/${replacementId}?error=${encodeURIComponent(messageFrom(error))}`);
  }
  const submissionId = randomUUID();
  const supabase = await createClient();
  let uploaded: string[] = [];
  let replacement: Replacement | null = null;
  try {
    const upload = await uploadFiles(replacementId, files, "QC_PHOTO", `qc/${submissionId}`, submissionId);
    uploaded = upload.uploaded;
    const { data, error } = await supabase.rpc("submit_qc", {
      p_replacement_id: replacementId,
      p_submission_id: submissionId,
      p_attachments: upload.rows,
    });
    if (error) throw error;
    replacement = data as Replacement;
  } catch (error) {
    if (uploaded.length) await supabase.storage.from("replacement-files").remove(uploaded);
    redirect(`/replacements/${replacementId}?error=${encodeURIComponent(messageFrom(error))}`);
  }
  const sent = await notifyTelegram("QC_SUBMITTED", replacement!);
  revalidatePath(`/replacements/${replacementId}`);
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
  if (!reason || !["NEW", "LABEL_PRINTED", "QC_PENDING", "QC_REJECTED", "QC_APPROVED", "PACKED", "SHIPPED", "NEEDS_TOKEN", "CANCELLED"].includes(target)) {
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
 * Authorization: Authenticated users of any active role (ESHA, PRINTING, PACKING, ADMIN).
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
 * Generates an email-confirmed auth user with initial metadata and a minimum 12-character password.
 */
export async function createUserAction(formData: FormData) {
  await requireProfile(["ADMIN"]);
  const email = String(formData.get("email") ?? "").trim();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const temporaryPassword = String(formData.get("temporary_password") ?? "");
  const role = String(formData.get("role") ?? "") as Role;
  if (!email || !fullName || temporaryPassword.length < 12 || !["ESHA", "PRINTING", "PACKING", "ADMIN"].includes(role)) redirect("/admin/users?error=Use%20a%20valid%20email%20and%20a%20temporary%20password%20of%20at%20least%2012%20characters.");
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error || !data.user) redirect(`/admin/users?error=${encodeURIComponent(error?.message ?? "Could not create user.")}`);
  const { error: profileError } = await admin.from("profiles").update({ role, active: true }).eq("id", data.user.id);
  if (profileError) {
    await admin.auth.admin.deleteUser(data.user.id);
    redirect(`/admin/users?error=${encodeURIComponent(profileError.message)}`);
  }
  revalidatePath("/admin/users");
  redirect("/admin/users?success=User%20created.%20Share%20the%20temporary%20password%20securely.");
}

/**
 * Updates a user's operational role and active status.
 *
 * Authorization: ADMIN only
 * Enables or disables account access and updates permissions in the `profiles` table.
 */
export async function updateUserAction(formData: FormData) {
  const actor = await requireProfile(["ADMIN"]);
  const id = String(formData.get("id") ?? "");
  const role = String(formData.get("role") ?? "") as Role;
  const active = formData.get("active") === "true";
  if (!/^[0-9a-f-]{36}$/i.test(id) || !["ESHA", "PRINTING", "PACKING", "ADMIN"].includes(role)) redirect("/admin/users?error=Invalid%20user%20update.");
  if (id === actor.id && (!active || role !== "ADMIN")) redirect("/admin/users?error=You%20cannot%20remove%20your%20own%20active%20administrator%20access.");
  const admin = createAdminClient();
  const { error } = await admin.from("profiles").update({ role, active }).eq("id", id);
  if (error) redirect(`/admin/users?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/admin/users");
}

/**
 * Updates the current authenticated user's account password.
 *
 * Authorization: Current authenticated user.
 * Validates password match and enforces minimum 12-character password policy.
 */
export async function updatePasswordAction(formData: FormData) {
  await requireProfile();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirm_password") ?? "");
  if (password.length < 12 || password !== confirmPassword) redirect("/profile?error=Passwords%20must%20match%20and%20be%20at%20least%2012%20characters.");
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) redirect(`/profile?error=${encodeURIComponent(error.message)}`);
  redirect("/profile?success=Password%20updated.");
}

/**
 * Permanently deletes a replacement order and cleans up all associated storage files.
 *
 * Authorization:
 * - ADMIN: Can delete any order at any status.
 * - ESHA: Can delete only orders they personally created, and only while status is still 'NEW'.
 *
 * Deletes the database record first so a database failure cannot leave an order
 * pointing at missing evidence, then performs best-effort privileged file cleanup.
 */
export async function deleteReplacementAction(formData: FormData) {
  const profile = await requireProfile(["ADMIN", "ESHA"]);
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

  if (profile.role !== "ADMIN" && (replacement.created_by !== profile.id || replacement.status !== "NEW")) {
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
