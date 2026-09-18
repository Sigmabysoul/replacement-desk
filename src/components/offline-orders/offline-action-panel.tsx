import Image from "next/image";
import { Check, CheckCircle2, Download, FileText, PackageCheck, Printer, TriangleAlert, Truck } from "lucide-react";
import {
  acknowledgeOrderAction,
  cancelOfflineOrderAction,
  confirmDeliveryAction,
  confirmPackingAction,
  confirmPickupAction,
  confirmPrintingAction,
  dispatchPrepareOfflineOrderAction,
} from "@/app/offline-actions";
import { OfflinePhotoPicker } from "@/components/offline-orders/offline-photo-picker";
import { Card } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { availableOfflineActions } from "@/lib/offline-orders/workflow";
import type { OfflineOrder, OfflineOrderAttachment, Profile } from "@/lib/types";

function isImage(mimeType: string) {
  return ["image/jpeg", "image/png", "image/webp"].includes(mimeType);
}

export function OfflineActionPanel({
  order,
  profile,
  attachments = [],
}: {
  order: OfflineOrder;
  profile: Profile;
  attachments?: OfflineOrderAttachment[];
}) {
  const userRoles = profile.roles?.length ? profile.roles : [profile.role];
  const actions = availableOfflineActions(userRoles, order.status);
  const actionable = actions.some((action) => action !== "COMMENT");

  if (!actionable && !["ACKNOWLEDGED", "CANCELLED"].includes(order.status)) {
    return (
      <Card className="border-indigo-100 bg-indigo-50 p-4">
        <p className="text-sm font-bold text-indigo-900">No action required from you right now.</p>
        <p className="mt-1 text-sm text-indigo-800">You can follow the timeline and updates below.</p>
      </Card>
    );
  }

  if (["ACKNOWLEDGED", "CANCELLED"].includes(order.status)) {
    return (
      <Card className="border-slate-200 bg-slate-50 p-4 text-center">
        <p className="font-bold text-slate-700">
          {order.status === "ACKNOWLEDGED" ? "This order is complete and acknowledged." : "This order has been cancelled."}
        </p>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 sm:px-5">
        <h2 className="font-black text-slate-950">Next action</h2>
      </div>

      <div className="grid gap-5 p-4 sm:p-5">
        {/* Step 1: Consignment confirms packing (Boxes, Dimensions, Weight) */}
        {actions.includes("CONFIRM_PACKING") && (
          <form action={confirmPackingAction} className="grid gap-4">
            <input type="hidden" name="order_id" value={order.id} />
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3 text-xs text-indigo-900">
              <strong>Consignment Team (Ali Sir):</strong> Confirm the box count, carton dimensions (e.g. 56X32X38), and total weight once packed.
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Carton Count" hint="Total boxes">
                <Input
                  required
                  type="number"
                  name="carton_count"
                  min={1}
                  max={9999}
                  defaultValue={order.carton_count ?? ""}
                  placeholder="e.g. 3"
                />
              </Field>
              <Field label="Box Dimensions" hint="LxBxH (e.g. 56X32X38)">
                <Input
                  name="carton_dimensions"
                  maxLength={100}
                  defaultValue={order.carton_dimensions ?? ""}
                  placeholder="e.g. 56X32X38"
                />
              </Field>
              <Field label="Total Weight (KG)">
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max="10000"
                  name="carton_weight_kg"
                  defaultValue={order.carton_weight_kg ?? ""}
                  placeholder="e.g. 57"
                />
              </Field>
            </div>
            <SubmitButton pendingText="Saving packing details…">
              <PackageCheck className="size-5" />
              CONFIRM PACKING DETAILS
            </SubmitButton>
          </form>
        )}

        {/* Step 2: HR adds logistics details + uploads compressed photos */}
        {actions.includes("DISPATCH_PREPARE") && (
          <form action={dispatchPrepareOfflineOrderAction} className="grid gap-4">
            <input type="hidden" name="order_id" value={order.id} />
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3 text-xs text-indigo-900">
              <strong>HR Team (Nainisha Mam):</strong> Enter courier, LR number, tracking link, and attach photos/labels for the Printing team.
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Logistics Partner">
                <Input
                  name="logistics_partner"
                  defaultValue={order.logistics_partner ?? ""}
                  placeholder="e.g. Delhivery, Bluedart, SafeXpress"
                />
              </Field>
              <Field label="LR / Consignment Number">
                <Input
                  name="lr_number"
                  defaultValue={order.lr_number ?? ""}
                  placeholder="e.g. DEL12345678"
                />
              </Field>
            </div>
            <Field label="Tracking Link" hint="Must begin with https://">
              <Input
                type="url"
                name="tracking_url"
                defaultValue={order.tracking_url ?? ""}
                placeholder="https://delhivery.com/track/..."
              />
            </Field>

            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700">
                Dispatch Photos & Labels (sent to Printing Team)
              </label>
              <OfflinePhotoPicker name="dispatch_documents" maxFiles={20} />
            </div>

            <SubmitButton pendingText="Saving dispatch details and photos…">
              <Truck className="size-5" />
              SUBMIT DISPATCH DETAILS & PHOTOS
            </SubmitButton>
          </form>
        )}

        {/* Step 3: Printing Team confirms printing */}
        {actions.includes("CONFIRM_PRINTING") && (
          <div className="grid gap-4">
            <div className="rounded-xl border border-fuchsia-100 bg-fuchsia-50/50 p-3.5 text-xs text-fuchsia-900">
              <strong>Printing Team:</strong> Please print the shipping labels and documents uploaded by HR below, then mark printing done.
            </div>

            {attachments.length > 0 && (
              <div className="grid gap-2">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Labels & Documents to Print ({attachments.length})
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                  {attachments.map((file) => (
                    <div
                      key={file.id}
                      className="group relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-2 text-center"
                    >
                      {file.signed_url && isImage(file.mime_type) ? (
                        <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-slate-100">
                          <Image src={file.signed_url} alt={file.file_name} fill unoptimized className="object-cover" />
                        </div>
                      ) : (
                        <div className="flex aspect-video w-full items-center justify-center rounded-lg bg-slate-200">
                          <FileText className="size-6 text-slate-500" />
                        </div>
                      )}
                      <p className="mt-1.5 truncate text-[11px] font-bold text-slate-800">{file.file_name}</p>
                      {file.signed_url && (
                        <a
                          href={file.signed_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:underline"
                        >
                          <Download className="size-3" /> View / Download
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <form action={confirmPrintingAction}>
              <input type="hidden" name="order_id" value={order.id} />
              <ConfirmButton message="Confirm that materials and labels for this offline order are printed and prepared.">
                <Printer className="size-5" />
                CONFIRM PRINTING DONE
              </ConfirmButton>
            </form>
          </div>
        )}

        {/* Step 4: Consignment confirms courier pickup */}
        {actions.includes("CONFIRM_PICKUP") && (
          <form action={confirmPickupAction}>
            <input type="hidden" name="order_id" value={order.id} />
            <div className="mb-3 rounded-xl border border-cyan-100 bg-cyan-50/50 p-3 text-xs text-cyan-900">
              <strong>Consignment Team (Ali Sir):</strong> Once the courier has picked up the packed and labelled boxes, confirm the pickup.
            </div>
            <ConfirmButton message="Confirm that the courier has picked up the packed boxes from the warehouse.">
              <Check className="size-5" />
              CONFIRM PICK UP DONE
            </ConfirmButton>
          </form>
        )}

        {/* Step 5: HR confirms delivery with POD */}
        {actions.includes("CONFIRM_DELIVERY") && (
          <form action={confirmDeliveryAction} className="grid gap-4">
            <input type="hidden" name="order_id" value={order.id} />
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3 text-xs text-emerald-900">
              <strong>HR Team (Nainisha Mam):</strong> Confirm delivery to the client and upload Proof of Delivery (POD).
            </div>
            <Field label="Proof of Delivery Notes">
              <Textarea
                name="pod_notes"
                placeholder="Recipient name, delivery timestamp, signature confirmation notes..."
                className="min-h-20"
              />
            </Field>

            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700">
                Proof of Delivery (POD) Photos / Documents
              </label>
              <OfflinePhotoPicker name="pod_documents" maxFiles={10} />
            </div>

            <SubmitButton pendingText="Confirming delivery…">
              <CheckCircle2 className="size-5" />
              CONFIRM DELIVERY & SAVE POD
            </SubmitButton>
          </form>
        )}

        {/* Step 6: Boss acknowledges completed order */}
        {actions.includes("ACKNOWLEDGE_ORDER") && (
          <form action={acknowledgeOrderAction}>
            <input type="hidden" name="order_id" value={order.id} />
            <div className="mb-3 rounded-xl border border-slate-200 bg-slate-100/70 p-3 text-xs text-slate-800">
              <strong>Boss:</strong> Review the delivered shipment and attached POD, then acknowledge completion.
            </div>
            <ConfirmButton message="Acknowledge this delivery as completed and noted.">
              <Check className="size-5" />
              ACKNOWLEDGE & NOTE COMPLETED
            </ConfirmButton>
          </form>
        )}

        {/* Cancel Order (Boss or Admin) */}
        {actions.includes("CANCEL_ORDER") && (
          <details className="mt-2 rounded-xl border border-rose-200 bg-rose-50/50 p-3">
            <summary className="cursor-pointer text-xs font-bold text-rose-700 hover:underline">
              Cancel this offline order
            </summary>
            <form action={cancelOfflineOrderAction} className="mt-3 grid gap-3">
              <input type="hidden" name="order_id" value={order.id} />
              <Field label="Cancellation Reason">
                <Textarea
                  name="reason"
                  required
                  maxLength={1000}
                  placeholder="Explain why this order is cancelled..."
                  className="min-h-20 border-rose-300"
                />
              </Field>
              <SubmitButton variant="danger" pendingText="Cancelling…">
                <TriangleAlert className="size-5" />
                CANCEL OFFLINE ORDER
              </SubmitButton>
            </form>
          </details>
        )}
      </div>
    </Card>
  );
}
