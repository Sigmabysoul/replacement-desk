import { Check, Download, PackageCheck, Printer, Send, TriangleAlert, X } from "lucide-react";
import { adminOverrideAction, submitQcAction, transitionAction } from "@/app/actions";
import { Card } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Field, Select, Textarea } from "@/components/ui/field";
import { STATUSES } from "@/lib/types";
import { statusLabel } from "@/lib/utils";
import { SubmitButton } from "@/components/ui/submit-button";
import { availableActions } from "@/lib/replacements/workflow";
import { QcUploadForm } from "@/components/replacements/qc-upload-form";
import type { Attachment, Profile, Replacement } from "@/lib/types";

/**
 * Role-aware operational action panel rendered on the replacement detail screen.
 *
 * Dynamically presents only legal actions based on user's active role and current status:
 * - PRINTING: Downloads shipping label and confirms label printing.
 * - PACKING: Renders QC camera/upload form (when in LABEL_PRINTED / QC_REJECTED) and packs order (after QC_APPROVED).
 * - ESHA: Reviews QC photos (Approve / Reject with feedback), marks dispatched (SHIPPED / NEEDS_TOKEN).
 * - ADMIN: Performs any standard transition or uses emergency status override with reason logging.
 *
 * @param props.replacement Current replacement order data.
 * @param props.profile Active user session profile.
 * @param props.attachments Array of uploaded files (labels, QC photos, customer proofs).
 */
export function ActionPanel({
  replacement,
  profile,
  attachments,
}: {
  replacement: Replacement;
  profile: Profile;
  attachments: Attachment[];
}) {
  const actions = availableActions(profile.role, replacement.status);
  const labels = attachments.filter((item) => item.attachment_type === "LABEL");
  const actionable = actions.some((action) => action !== "COMMENT" && action !== "UPLOAD");

  if (!actionable && !["SHIPPED", "CANCELLED"].includes(replacement.status)) {
    return (
      <Card className="border-indigo-100 bg-indigo-50 p-4">
        <p className="text-sm font-bold text-indigo-900">No action needed from you right now.</p>
        <p className="mt-1 text-sm text-indigo-800">You can follow progress in the activity below.</p>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 sm:px-5">
        <h2 className="font-black text-slate-950">Next action</h2>
      </div>
      <div className="grid gap-4 p-4 sm:p-5">
        {actions.includes("MARK_LABEL_PRINTED") && (
          <>
            <div className="grid gap-2">
              {labels.length ? (
                labels.map((label) => (
                  <a
                    key={label.id}
                    href={label.signed_url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-bold text-slate-800 hover:bg-slate-50"
                  >
                    <Download className="size-5" />
                    OPEN / DOWNLOAD LABEL
                  </a>
                ))
              ) : (
                <p className="rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-900">
                  No label is attached. Ask Esha to upload it.
                </p>
              )}
            </div>
            <form action={transitionAction}>
              <input type="hidden" name="replacement_id" value={replacement.id} />
              <input type="hidden" name="target_status" value="LABEL_PRINTED" />
              <ConfirmButton message="Confirm that the physical label has been printed.">
                <Printer className="size-5" />
                MARK LABEL PRINTED
              </ConfirmButton>
            </form>
          </>
        )}

        {actions.includes("SUBMIT_QC") && (
          <QcUploadForm replacementId={replacement.id} action={submitQcAction} />
        )}

        {actions.includes("APPROVE_QC") && (
          <div className="grid gap-3 sm:grid-cols-2">
            <form action={transitionAction}>
              <input type="hidden" name="replacement_id" value={replacement.id} />
              <input type="hidden" name="target_status" value="QC_APPROVED" />
              <ConfirmButton message="Approve this QC submission? Packing will be allowed to continue.">
                <Check className="size-5" />
                APPROVE QC
              </ConfirmButton>
            </form>
            <form action={transitionAction} className="grid gap-3">
              <input type="hidden" name="replacement_id" value={replacement.id} />
              <input type="hidden" name="target_status" value="QC_REJECTED" />
              <Textarea
                name="message"
                required
                maxLength={1000}
                placeholder="Why is the QC rejected?"
                className="min-h-20"
              />
              <SubmitButton variant="danger" pendingText="Rejecting…">
                <X className="size-5" />
                REJECT QC
              </SubmitButton>
            </form>
          </div>
        )}

        {actions.includes("MARK_PACKED") && (
          <form action={transitionAction}>
            <input type="hidden" name="replacement_id" value={replacement.id} />
            <input type="hidden" name="target_status" value="PACKED" />
            <ConfirmButton message="Confirm this approved replacement is packed and ready for dispatch.">
              <PackageCheck className="size-5" />
              MARK PACKED
            </ConfirmButton>
          </form>
        )}

        {actions.includes("MARK_SHIPPED") && (
          <form action={transitionAction}>
            <input type="hidden" name="replacement_id" value={replacement.id} />
            <input type="hidden" name="target_status" value="SHIPPED" />
            <ConfirmButton message="Confirm the delivery person picked up this replacement.">
              <Send className="size-5" />
              SHIPPED
            </ConfirmButton>
          </form>
        )}

        {actions.includes("MARK_NEEDS_TOKEN") && (
          <form action={transitionAction}>
            <input type="hidden" name="replacement_id" value={replacement.id} />
            <input type="hidden" name="target_status" value="NEEDS_TOKEN" />
            <ConfirmButton
              variant="warning"
              message="Confirm this replacement was not picked up and needs a token."
            >
              <TriangleAlert className="size-5" />
              NEEDS TOKEN
            </ConfirmButton>
          </form>
        )}

        {profile.role === "ADMIN" && (
          <details className="border-t border-slate-200 pt-4">
            <summary className="cursor-pointer text-sm font-bold text-slate-600">Admin status override</summary>
            <form action={adminOverrideAction} className="mt-3 grid gap-3">
              <input type="hidden" name="replacement_id" value={replacement.id} />
              <Field label="New status">
                <Select name="target_status" required defaultValue="">
                  <option value="" disabled>
                    Select status
                  </option>
                  {STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {statusLabel[status]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Reason">
                <Textarea
                  name="reason"
                  required
                  maxLength={1000}
                  placeholder="Why is this override necessary?"
                  className="min-h-20"
                />
              </Field>
              <ConfirmButton variant="danger" message="This bypasses the normal workflow. Continue?">
                OVERRIDE STATUS
              </ConfirmButton>
            </form>
          </details>
        )}
      </div>
    </Card>
  );
}
