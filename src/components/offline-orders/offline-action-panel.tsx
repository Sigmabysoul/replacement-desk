import { Check, CheckCircle2, PackageCheck, Printer, TriangleAlert, Truck } from "lucide-react";
import {
  acknowledgeOrderAction,
  cancelOfflineOrderAction,
  confirmDeliveryAction,
  confirmPackingAction,
  confirmPickupAction,
  confirmPrintingAction,
  dispatchOfflineOrderAction,
} from "@/app/offline-actions";
import { Card } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { availableOfflineActions } from "@/lib/offline-orders/workflow";
import type { OfflineOrder, Profile } from "@/lib/types";

export function OfflineActionPanel({
  order,
  profile,
}: {
  order: OfflineOrder;
  profile: Profile;
}) {
  const actions = availableOfflineActions(profile.role, order.status);
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
        {/* Step 1: Print confirmation */}
        {actions.includes("CONFIRM_PRINTING") && (
          <form action={confirmPrintingAction}>
            <input type="hidden" name="order_id" value={order.id} />
            <ConfirmButton message="Confirm that materials / labels for this offline order are printed and prepared.">
              <Printer className="size-5" />
              CONFIRM PRINTING DONE
            </ConfirmButton>
          </form>
        )}

        {/* Step 2: Packing confirmation by Consignment */}
        {actions.includes("CONFIRM_PACKING") && (
          <form action={confirmPackingAction} className="grid gap-4">
            <input type="hidden" name="order_id" value={order.id} />
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3 text-xs text-indigo-900">
              <strong>Consignment Team:</strong> Confirm the box count, carton dimensions (e.g. 56X32X38), and total weight once packed.
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
              <Field label="Box Dimensions" hint="LxBxH (cm or string)">
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

        {/* Step 3: Dispatch by HR */}
        {actions.includes("DISPATCH_ORDER") && (
          <form action={dispatchOfflineOrderAction} className="grid gap-4">
            <input type="hidden" name="order_id" value={order.id} />
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3 text-xs text-indigo-900">
              <strong>HR Team:</strong> Attach the LR number, courier tracking link, and upload any dispatch docs or consignment receipts.
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Logistics Partner">
                <Input
                  name="logistics_partner"
                  defaultValue={order.logistics_partner ?? ""}
                  placeholder="e.g. Delhivery, Bluedart"
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
            <Field label="Dispatch Documents (optional)" hint="PDF, JPEG, PNG, or WebP up to 25 MB">
              <Input
                type="file"
                name="dispatch_documents"
                multiple
                accept="application/pdf,image/jpeg,image/png,image/webp"
              />
            </Field>
            <SubmitButton pendingText="Dispatching order…">
              <Truck className="size-5" />
              DISPATCH ORDER
            </SubmitButton>
          </form>
        )}

        {/* Step 4: Pickup confirmation by Consignment */}
        {actions.includes("CONFIRM_PICKUP") && (
          <form action={confirmPickupAction}>
            <input type="hidden" name="order_id" value={order.id} />
            <ConfirmButton message="Confirm that the courier has picked up the packed boxes from the warehouse.">
              <Check className="size-5" />
              CONFIRM PICK UP DONE
            </ConfirmButton>
          </form>
        )}

        {/* Step 5: Delivery confirmation by HR */}
        {actions.includes("CONFIRM_DELIVERY") && (
          <form action={confirmDeliveryAction} className="grid gap-4">
            <input type="hidden" name="order_id" value={order.id} />
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3 text-xs text-indigo-900">
              <strong>HR Team:</strong> Confirm delivery to the client and upload Proof of Delivery (POD).
            </div>
            <Field label="Proof of Delivery Notes">
              <Textarea
                name="pod_notes"
                placeholder="Recipient name, delivery timestamp, signature confirmation notes..."
                className="min-h-20"
              />
            </Field>
            <Field label="Proof of Delivery (POD) Files" hint="Signed POD photo or scanned PDF">
              <Input
                type="file"
                name="pod_documents"
                multiple
                accept="application/pdf,image/jpeg,image/png,image/webp"
              />
            </Field>
            <SubmitButton pendingText="Confirming delivery…">
              <CheckCircle2 className="size-5" />
              CONFIRM DELIVERY & SAVE POD
            </SubmitButton>
          </form>
        )}

        {/* Step 6: Boss acknowledgment */}
        {actions.includes("ACKNOWLEDGE_ORDER") && (
          <form action={acknowledgeOrderAction}>
            <input type="hidden" name="order_id" value={order.id} />
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
