import Link from "next/link";
import Image from "next/image";
import {
  ArrowLeft,
  Download,
  ExternalLink,
  FileText,
  MessageCircle,
  Package,
  Pencil,
  ShoppingBag,
  Trash2,
  UserRound,
} from "lucide-react";
import { notFound } from "next/navigation";
import { addCommentAction, deleteReplacementAction } from "@/app/actions";
import { ActionPanel } from "@/components/replacements/action-panel";
import { ActivityTimeline } from "@/components/replacements/activity-timeline";
import { StatusBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import { requireProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { ActivityLog, Attachment, Profile, QcSubmission, Replacement } from "@/lib/types";
import { formatDate } from "@/lib/utils";

function isImageAttachment(file: Attachment) {
  return ["image/jpeg", "image/png", "image/webp"].includes(file.mime_type);
}

export default async function ReplacementDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; warning?: string; success?: string }>;
}) {
  const profile = await requireProfile();
  const { id } = await params;
  const notice = await searchParams;
  const supabase = await createClient();

  const [
    { data: replacementData },
    { data: attachmentData },
    { data: qcData },
    { data: activityData },
  ] = await Promise.all([
    supabase.from("replacements").select("*").eq("id", id).single(),
    supabase.from("attachments").select("*").eq("replacement_id", id).order("created_at"),
    supabase
      .from("qc_submissions")
      .select("*")
      .eq("replacement_id", id)
      .order("submission_number", { ascending: false }),
    supabase.from("activity_logs").select("*").eq("replacement_id", id).order("created_at", { ascending: true }),
  ]);

  if (!replacementData) notFound();
  const replacement = replacementData as Replacement;
  const attachments = (attachmentData ?? []) as Attachment[];
  const qcs = (qcData ?? []) as QcSubmission[];
  const activities = (activityData ?? []) as ActivityLog[];

  const actorIds = [
    ...new Set(
      [
        replacement.created_by,
        ...activities.map((item) => item.actor_id),
        ...qcs.flatMap((item) => [item.submitted_by, item.reviewed_by]),
      ].filter(Boolean),
    ),
  ] as string[];

  const { data: profileRows } = actorIds.length
    ? await supabase.from("profiles").select("id,full_name,role").in("id", actorIds)
    : { data: [] };

  const names = new Map(
    (profileRows ?? []).map((item) => [item.id, item as Pick<Profile, "full_name" | "role">]),
  );

  if (attachments.length > 0) {
    const { data: signedData } = await supabase.storage
      .from("replacement-files")
      .createSignedUrls(
        attachments.map((item) => item.storage_path),
        60 * 15
      );
    const urlMap = new Map(
      (signedData ?? [])
        .filter((item) => item.path && item.signedUrl)
        .map((item) => [item.path as string, item.signedUrl as string]),
    );
    attachments.forEach((attachment) => {
      attachment.signed_url = urlMap.get(attachment.storage_path) ?? undefined;
    });
  }

  replacement.creator = names.get(replacement.created_by) ?? null;
  activities.forEach((item) => {
    item.actor = item.actor_id ? names.get(item.actor_id) ?? null : null;
  });

  qcs.forEach((item) => {
    item.submitter = item.submitted_by ? names.get(item.submitted_by) ?? null : null;
    item.reviewer = item.reviewed_by ? names.get(item.reviewed_by) ?? null : null;
    item.attachments = attachments.filter((att) => att.qc_submission_id === item.id);
  });

  const generalFiles = attachments.filter((item) => item.attachment_type !== "QC_PHOTO");

  return (
    <div className="grid gap-5">
      <Link
        href="/replacements"
        className="inline-flex w-fit items-center gap-2 text-sm font-bold text-slate-600 hover:text-indigo-700"
      >
        <ArrowLeft className="size-4" />
        All replacements
      </Link>

      <Notice>{notice.error}</Notice>
      <Notice tone="success">{notice.success}</Notice>
      <Notice tone="warning">{notice.warning}</Notice>

      <section className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <div className="grid gap-5">
          {/* Main Replacement Overview Card */}
          <Card className="overflow-hidden">
            <div className="border-b border-slate-100 bg-[linear-gradient(135deg,var(--muted),var(--card))] p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-indigo-700">{replacement.order_type === "OFFLINE" ? "OFFLINE ORDER" : "REPLACEMENT"} · ORDER #{replacement.order_number} · {replacement.replacement_number}</p>
                  <h1 className="text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
                    {replacement.order_reference}
                  </h1>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={replacement.status} className="text-sm" />
                  {["CUSTOMER_SUPPORT", "ADMIN"].includes(profile.role) &&
                    !["SHIPPED", "CANCELLED"].includes(replacement.status) && (
                      <Link
                        href={`/replacements/${replacement.id}/edit`}
                        className="grid size-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:text-indigo-700"
                        aria-label="Edit replacement"
                      >
                        <Pencil className="size-4" />
                      </Link>
                    )}
                  {(profile.role === "ADMIN" ||
                    (profile.role === "CUSTOMER_SUPPORT" &&
                      replacement.created_by === profile.id &&
                      replacement.status === "NEW")) && (
                    <form action={deleteReplacementAction}>
                      <input type="hidden" name="replacement_id" value={replacement.id} />
                      <ConfirmButton
                        variant="danger"
                        className="h-10 px-3 text-xs"
                        message={`Permanently delete ${replacement.replacement_number}? This action cannot be undone and removes all attached files.`}
                      >
                        <Trash2 className="size-4" />
                        <span className="hidden sm:inline">DELETE</span>
                      </ConfirmButton>
                    </form>
                  )}
                </div>
              </div>
            </div>

            <dl className="grid gap-x-6 gap-y-5 p-5 sm:grid-cols-2 sm:p-6">
              <div>
                <dt className="text-xs font-bold uppercase tracking-wider text-slate-500">Product</dt>
                <dd className="mt-1 flex items-center gap-2 text-base font-bold text-slate-950">
                  <Package className="size-4 text-indigo-500" />
                  {replacement.product_name}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-bold uppercase tracking-wider text-slate-500">Quantity</dt>
                <dd className="mt-1 text-base font-bold text-slate-950">{replacement.quantity}</dd>
              </div>
              <div>
                <dt className="text-xs font-bold uppercase tracking-wider text-slate-500">Courier Partner</dt>
                <dd className="mt-1 flex items-center gap-2 font-semibold text-slate-800">
                  <ShoppingBag className="size-4 text-slate-400" />
                  {replacement.order_reference}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-bold uppercase tracking-wider text-slate-500">Shipping speed</dt>
                <dd className="mt-1 font-semibold text-slate-800">{replacement.shipping_speed === "EXPRESS" ? "Express" : "Standard"}</dd>
              </div>
              {replacement.order_type === "REPLACEMENT" && replacement.length_cm && replacement.breadth_cm && replacement.height_cm ? (
                <div>
                  <dt className="text-xs font-bold uppercase tracking-wider text-slate-500">Dimensions</dt>
                  <dd className="mt-1 font-semibold text-slate-800">{replacement.length_cm} × {replacement.breadth_cm} × {replacement.height_cm} cm</dd>
                </div>
              ) : null}
              {replacement.tracking_url && (
                <div>
                  <dt className="text-xs font-bold uppercase tracking-wider text-slate-500">Tracking</dt>
                  <dd className="mt-1">
                    <a
                      href={replacement.tracking_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 font-semibold text-indigo-700 hover:text-indigo-900 hover:underline"
                    >
                      Open tracking link <ExternalLink className="size-4" />
                    </a>
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-xs font-bold uppercase tracking-wider text-slate-500">Created</dt>
                <dd className="mt-1 font-semibold text-slate-800">{formatDate(replacement.created_at)}</dd>
              </div>
              <div>
                <dt className="text-xs font-bold uppercase tracking-wider text-slate-500">Created by</dt>
                <dd className="mt-1 flex items-center gap-2 font-semibold text-slate-800">
                  <UserRound className="size-4 text-slate-400" />
                  {replacement.creator?.full_name ?? "Unknown"}
                </dd>
              </div>
              {replacement.customer_name && (
                <div>
                  <dt className="text-xs font-bold uppercase tracking-wider text-slate-500">Customer Name</dt>
                  <dd className="mt-1 font-semibold text-slate-800">{replacement.customer_name}</dd>
                </div>
              )}
              {replacement.customer_phone ? <div><dt className="text-xs font-bold uppercase tracking-wider text-slate-500">Customer phone</dt><dd className="mt-1 font-semibold text-slate-800">{replacement.customer_phone}</dd></div> : null}
              {replacement.customer_email ? <div><dt className="text-xs font-bold uppercase tracking-wider text-slate-500">Customer email</dt><dd className="mt-1 font-semibold text-slate-800">{replacement.customer_email}</dd></div> : null}
              {replacement.customer_address ? <div className="sm:col-span-2"><dt className="text-xs font-bold uppercase tracking-wider text-slate-500">Customer address</dt><dd className="mt-1 whitespace-pre-wrap font-semibold text-slate-800">{replacement.customer_address}</dd></div> : null}
              {replacement.reason && (
                <div>
                  <dt className="text-xs font-bold uppercase tracking-wider text-slate-500">Reason</dt>
                  <dd className="mt-1 font-semibold text-slate-800">{replacement.reason}</dd>
                </div>
              )}
              {replacement.notes && (
                <div className="sm:col-span-2">
                  <dt className="text-xs font-bold uppercase tracking-wider text-slate-500">Notes</dt>
                  <dd className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{replacement.notes}</dd>
                </div>
              )}
            </dl>
          </Card>

          {/* QC Submissions Grouped By Attempt */}
          {qcs.length > 0 && (
            <Card className="p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-black text-slate-950">Quality Check (QC)</h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {qcs.length} submission attempt{qcs.length === 1 ? "" : "s"} recorded
                  </p>
                </div>
              </div>
              <div className="mt-4 grid gap-4">
                {qcs.map((qc) => {
                  const photos =
                    qc.attachments ?? attachments.filter((att) => att.qc_submission_id === qc.id);
                  return (
                    <div key={qc.id} className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-slate-950">
                            Submission #{qc.submission_number}
                          </span>
                          <span
                            className={`rounded-full border px-2.5 py-0.5 text-xs font-black ${
                              qc.decision === "APPROVED"
                                ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                                : qc.decision === "REJECTED"
                                ? "border-rose-300 bg-rose-50 text-rose-800"
                                : "border-amber-300 bg-amber-50 text-amber-900"
                            }`}
                          >
                            {qc.decision === "APPROVED"
                              ? "✅ Approved"
                              : qc.decision === "REJECTED"
                              ? "❌ Rejected"
                              : "🟡 Pending Review"}
                          </span>
                        </div>
                        <span className="text-xs font-medium text-slate-500">
                          By {qc.submitter?.full_name ?? "Packing"} • {formatDate(qc.submitted_at)}
                        </span>
                      </div>

                      {qc.rejection_reason && (
                        <div className="mt-3 rounded-lg border-l-4 border-rose-500 bg-white p-3 text-sm">
                          <p className="text-xs font-bold uppercase tracking-wider text-rose-700">
                            Rejection reason
                          </p>
                          <p className="mt-1 font-semibold text-rose-950">“{qc.rejection_reason}”</p>
                          {qc.reviewed_at && (
                            <p className="mt-1 text-xs text-slate-500">
                              Reviewed by {qc.reviewer?.full_name ?? "CUSTOMER_SUPPORT"} on {formatDate(qc.reviewed_at)}
                            </p>
                          )}
                        </div>
                      )}

                      {photos.length > 0 ? (
                        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                          {photos.map((photo) =>
                            photo.signed_url ? (
                              <a
                                key={photo.id}
                                href={photo.signed_url}
                                target="_blank"
                                rel="noreferrer"
                                className="group relative aspect-square overflow-hidden rounded-xl border border-slate-200 bg-slate-100"
                              >
                                <Image
                                  src={photo.signed_url}
                                  alt={photo.file_name}
                                  fill
                                  unoptimized
                                  sizes="(max-width: 640px) 50vw, 220px"
                                  className="object-cover transition group-hover:scale-105"
                                />
                              </a>
                            ) : (
                              <div
                                key={photo.id}
                                className="grid aspect-square place-items-center rounded-xl bg-slate-100 p-2 text-center text-xs text-slate-500"
                              >
                                Unavailable
                              </div>
                            ),
                          )}
                        </div>
                      ) : (
                        <p className="mt-3 text-xs text-slate-500">No photos linked to this submission.</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* General Order Attachments and Shipping Labels */}
          <Card className="p-4 sm:p-5">
            <div>
              <h2 className="font-black text-slate-950">Order files & labels</h2>
              <p className="mt-1 text-xs text-slate-500">Preview customer photos and shipping labels here. Open an item for its full-size original.</p>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {generalFiles.map((file) => (
                <div key={file.id} className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                  {file.signed_url && isImageAttachment(file) ? (
                    <a href={file.signed_url} target="_blank" rel="noreferrer" className="group relative block aspect-[4/3] bg-slate-100">
                      <Image
                        src={file.signed_url}
                        alt={file.file_name}
                        fill
                        unoptimized
                        sizes="(max-width: 640px) 100vw, 420px"
                        className="object-contain transition group-hover:scale-[1.02]"
                      />
                      <span className="absolute inset-x-3 bottom-3 rounded-lg bg-slate-950/75 px-3 py-2 text-center text-xs font-bold text-white opacity-0 transition group-hover:opacity-100">
                        Open full-size preview
                      </span>
                    </a>
                  ) : file.signed_url ? (
                    <object data={file.signed_url} type="application/pdf" className="h-72 w-full bg-white" aria-label={`${file.file_name} preview`}>
                      <a href={file.signed_url} target="_blank" rel="noreferrer" className="grid h-full place-items-center gap-2 p-6 text-center text-sm font-bold text-indigo-700 hover:underline">
                        <FileText className="size-8" /> Open PDF preview
                      </a>
                    </object>
                  ) : (
                    <div className="grid aspect-[4/3] place-items-center bg-slate-100 p-4 text-center text-sm text-slate-500">Preview unavailable</div>
                  )}
                  <a href={file.signed_url} target="_blank" rel="noreferrer" className="flex min-h-12 items-center gap-3 border-t border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-indigo-50">
                    <FileText className="size-5 shrink-0 text-indigo-600" />
                    <span className="min-w-0 flex-1 truncate">{file.file_name}</span>
                    <Download className="size-4 shrink-0" />
                  </a>
                </div>
              ))}
              {generalFiles.length === 0 && (
                <p className="text-sm text-slate-500">No customer photos or labels attached.</p>
              )}
            </div>
          </Card>
        </div>

        {/* Right Sidebar: Contextual Actions & Commenting */}
        <div className="grid content-start gap-5">
          <ActionPanel replacement={replacement} profile={profile} />
          <Card className="p-4 sm:p-5">
            <h2 className="font-black text-slate-950">Add comment</h2>
            <form action={addCommentAction} className="mt-3 grid gap-3">
              <input type="hidden" name="replacement_id" value={replacement.id} />
              <Input name="message" maxLength={1000} required placeholder="Write a short update…" />
              <SubmitButton pendingText="Adding…">
                <MessageCircle className="size-5" />
                ADD COMMENT
              </SubmitButton>
            </form>
          </Card>
        </div>
      </section>

      {/* Activity Timeline */}
      <Card className="p-4 sm:p-6">
        <div className="mb-5">
          <h2 className="text-lg font-black text-slate-950">Activity</h2>
          <p className="text-sm text-slate-500">A complete conversation-style history of this replacement.</p>
        </div>
        <ActivityTimeline activities={activities} />
      </Card>
    </div>
  );
}
