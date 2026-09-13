import { Check, PackageCheck, Printer, Send, TriangleAlert, X } from "lucide-react";
import { adminOverrideAction, submitLogisticsLabelAction, submitPackingQcAction, transitionAction } from "@/app/actions";
import { Card } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Field, Select, Textarea } from "@/components/ui/field";
import { STATUSES } from "@/lib/types";
import { statusLabel } from "@/lib/utils";
import { SubmitButton } from "@/components/ui/submit-button";
import { availableActions } from "@/lib/replacements/workflow";
import { LogisticsLabelUploadForm } from "@/components/replacements/logistics-label-upload-form";
import { PackingQcUploadForm } from "@/components/replacements/packing-qc-upload-form";
import type { Profile, Replacement } from "@/lib/types";

/**
 * Role-aware operational action panel rendered on the replacement detail screen.
 *
 * Dynamically presents only legal actions based on user's active role and current status:
 * - LOGISTICS: Uploads the shipping label.
 * - PRINTING: Confirms that the uploaded label was printed.
 * - PACKING: Submits QC photos, packs approved orders, and completes dispatch.
 * - ESHA: Reviews QC photos (Approve / Reject with feedback).
 * - ADMIN: Performs any standard transition or uses emergency status override with reason logging.
 *
 * @param props.replacement Current replacement order data.
 * @param props.profile Active user session profile.
 */
export function ActionPanel({
  replacement,
  profile,
}: {
  replacement: Replacement;
  profile: Profile;
}) {
  const actions = availableActions(profile.role, replacement.status);
  const actionable = actions.some((action) => action !== "COMMENT");

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
        {actions.includes("UPLOAD_LABEL") && (
          <LogisticsLabelUploadForm replacementId={replacement.id} action={submitLogisticsLabelAction} />
        )}

        {actions.includes("MARK_LABEL_PRINTED") && (
          <form action={transitionAction}>
            <input type="hidden" name="replacement_id" value={replacement.id} />
            <input type="hidden" name="target_status" value="LABEL_PRINTED" />
            <ConfirmButton message="Confirm that this shipping label has been printed.">
              <Printer className="size-5" />
              MARK LABEL PRINTED
            </ConfirmButton>
          </form>
        )}

        {actions.includes("SUBMIT_QC") && (
          <PackingQcUploadForm replacementId={replacement.id} action={submitPackingQcAction} />
        )}

        {actions.includes("APPROVE_QC") && (
          <div className="grid gap-3 sm:grid-cols-2">
            <form action={transitionAction}>
              <input type="hidden" name="replacement_id" value={replacement.id} />
              <input type="hidden" name="target_status" value="QC_APPROVED" />
              <ConfirmButton message="Approve this submission? Packing will be allowed to pack the order.">
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
