"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  RotateCcw,
  X,
  XCircle,
} from "lucide-react";
import {
  markReplacementSuccessfulAction,
  markReplacementUnsuccessfulAction,
} from "@/app/actions";
import {
  confirmDeliveryAction,
  markOfflineDeliveryUnsuccessfulAction,
} from "@/app/offline-actions";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Input } from "@/components/ui/field";

interface ShipmentCardActionsProps {
  orderId: string;
  orderType: "replacement" | "offline";
  orderNumber: string;
  deliveryStatus: "SUCCESSFUL" | "UNSUCCESSFUL" | "RTA" | "RTO" | null;
  rtaReason?: string | null;
  courierPartner?: string | null;
}

export function ShipmentCardActions({
  orderId,
  orderType,
  orderNumber,
  deliveryStatus,
  rtaReason,
  courierPartner,
}: ShipmentCardActionsProps) {
  const [activeMode, setActiveMode] = useState<"idle" | "successful" | "unsuccessful">("idle");
  const [outcome, setOutcome] = useState<"UNSUCCESSFUL" | "RTA" | "RTO">(
    deliveryStatus === "UNSUCCESSFUL" ? "RTA" : "RTA",
  );

  const isOffline = orderType === "offline";
  const isRta = outcome === "RTA";
  const isRto = outcome === "RTO";

  return (
    <div className="mt-4 border-t border-slate-100 pt-4">
      {/* Status Warning Banners */}
      {deliveryStatus === "UNSUCCESSFUL" && activeMode === "idle" && (
        <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50/90 p-3 text-xs text-rose-900">
          <div className="flex items-center gap-1.5 font-black text-rose-800">
            <XCircle className="size-4 shrink-0 text-rose-600" />
            <span>Delivery Attempt Failed</span>
          </div>
          {rtaReason && (
            <p className="mt-1 text-slate-700">
              <strong className="text-slate-900">Reason:</strong> {rtaReason}
            </p>
          )}
          <p className="mt-1 text-[11px] font-medium text-rose-700">
            Awaiting RTA re-assignment or RTO (Return to Origin).
          </p>
        </div>
      )}

      {deliveryStatus === "RTA" && (
        <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50/90 p-3 text-xs text-amber-900">
          <div className="flex items-center gap-1.5 font-black text-amber-800">
            <RotateCcw className="size-4 shrink-0 text-amber-600" />
            <span>RTA Re-assigned · Active Re-dispatch</span>
          </div>
          {rtaReason && (
            <p className="mt-1 text-slate-700">
              <strong className="text-slate-900">Previous Issue:</strong> {rtaReason}
            </p>
          )}
        </div>
      )}

      {deliveryStatus === "RTO" && (
        <div className="mb-3 rounded-xl border border-red-200 bg-red-50/90 p-3 text-xs text-red-900">
          <div className="flex items-center gap-1.5 font-black text-red-800">
            <XCircle className="size-4 shrink-0 text-red-600" />
            <span>RTO (Return to Origin) · Returning to Warehouse</span>
          </div>
          {rtaReason && (
            <p className="mt-1 text-slate-700">
              <strong className="text-slate-900">RTO Reason:</strong> {rtaReason}
            </p>
          )}
        </div>
      )}

      {/* Mode 1: Idle (Action Triggers) */}
      {activeMode === "idle" && (
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setActiveMode("successful")}
            className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-emerald-700 active:scale-[0.98]"
          >
            <CheckCircle2 className="size-4" />
            Mark Delivered
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveMode("unsuccessful");
              setOutcome(deliveryStatus === "UNSUCCESSFUL" ? "RTA" : "RTA");
            }}
            className={`flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-bold shadow-xs transition active:scale-[0.98] ${
              deliveryStatus === "UNSUCCESSFUL"
                ? "bg-amber-500 text-slate-950 hover:bg-amber-400 font-black"
                : "border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
            }`}
          >
            {deliveryStatus === "UNSUCCESSFUL" ? (
              <>
                <RotateCcw className="size-4" />
                Assign RTA / Mark RTO
              </>
            ) : (
              <>
                <XCircle className="size-4" />
                Mark Unsuccessful / RTA / RTO
              </>
            )}
          </button>
        </div>
      )}

      {/* Mode 2: Mark Delivered Form */}
      {activeMode === "successful" && (
        <form
          action={isOffline ? confirmDeliveryAction : markReplacementSuccessfulAction}
          className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-3.5 text-xs animate-in fade-in"
        >
          <input
            type="hidden"
            name={isOffline ? "order_id" : "replacement_id"}
            value={orderId}
          />
          <input type="hidden" name="return_to" value="/tracking" />

          <div className="mb-2 flex items-center justify-between">
            <span className="font-black text-emerald-900 flex items-center gap-1.5">
              <CheckCircle2 className="size-4 text-emerald-600" />
              Confirm Successful Delivery
            </span>
            <button
              type="button"
              onClick={() => setActiveMode("idle")}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-200/60 hover:text-slate-700"
              aria-label="Cancel"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="mb-3">
            <label className="mb-1 block font-bold text-slate-700">
              Delivery Notes / Remarks <span className="text-rose-500">*</span>
            </label>
            <Input
              required
              name={isOffline ? "pod_notes" : "notes"}
              placeholder="e.g. Handed over to client security / customer signed POD..."
              className="h-9 bg-white text-xs"
              autoFocus
            />
          </div>

          <div className="flex items-center gap-2">
            <ConfirmButton
              message={`Confirm ${orderNumber} has been successfully delivered?`}
              className="h-9 flex-1 bg-emerald-600 text-xs font-bold text-white hover:bg-emerald-700"
            >
              <CheckCircle2 className="size-4" />
              CONFIRM DELIVERED
            </ConfirmButton>
            <button
              type="button"
              onClick={() => setActiveMode("idle")}
              className="min-h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Mode 3: Mark Unsuccessful, RTA Re-assignment, or RTO Form */}
      {activeMode === "unsuccessful" && (
        <form
          action={
            isOffline
              ? markOfflineDeliveryUnsuccessfulAction
              : markReplacementUnsuccessfulAction
          }
          className="rounded-2xl border border-rose-200 bg-rose-50/40 p-3.5 text-xs animate-in fade-in"
        >
          <input
            type="hidden"
            name={isOffline ? "order_id" : "replacement_id"}
            value={orderId}
          />
          <input type="hidden" name="return_to" value="/tracking" />
          <input type="hidden" name="outcome" value={outcome} />
          <input type="hidden" name="is_rta" value={isRta ? "true" : "false"} />

          <div className="mb-2 flex items-center justify-between">
            <span className="font-black text-rose-950 flex items-center gap-1.5">
              <AlertTriangle className="size-4 text-rose-600" />
              {isRto
                ? "Return to Origin (RTO)"
                : isRta
                ? "RTA Re-assignment & Tracking"
                : "Mark Delivery Unsuccessful"}
            </span>
            <button
              type="button"
              onClick={() => setActiveMode("idle")}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-200/60 hover:text-slate-700"
              aria-label="Cancel"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* Outcome Choice Selector */}
          <div className="mb-3">
            <label className="mb-1.5 block font-bold text-slate-700">Choose Action / Outcome</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setOutcome("RTA")}
                className={`flex items-center justify-center gap-1.5 rounded-xl border p-2 text-xs font-bold transition ${
                  isRta
                    ? "border-amber-400 bg-amber-500 text-slate-950 font-black shadow-xs"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                <RotateCcw className="size-3.5" />
                Re-attempt (RTA)
              </button>
              <button
                type="button"
                onClick={() => setOutcome("RTO")}
                className={`flex items-center justify-center gap-1.5 rounded-xl border p-2 text-xs font-bold transition ${
                  isRto
                    ? "border-red-500 bg-red-600 text-white font-black shadow-xs"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                <XCircle className="size-3.5" />
                Return to Origin (RTO)
              </button>
            </div>
          </div>

          {/* Failure reason text field */}
          <div className="mb-3">
            <label className="mb-1 block font-bold text-slate-700">
              Reason / Remarks <span className="text-rose-500">*</span>
            </label>
            <Input
              required
              defaultValue={rtaReason || ""}
              name="reason"
              placeholder={
                isRto
                  ? "e.g. Customer cancelled / Refused delivery / Returned to sender..."
                  : "e.g. Customer unavailable / Address not found / Phone unreachable..."
              }
              className="h-9 bg-white text-xs"
              autoFocus
            />
          </div>

          {/* RTA Tracking inputs */}
          {isRta && (
            <div className="mb-3 grid gap-2.5 rounded-xl border border-amber-200 bg-white p-3">
              <div className="text-[11px] font-bold text-amber-800">
                Enter new courier partner and tracking details for re-attempt delivery:
              </div>
              <div>
                <label className="mb-1 block font-bold text-slate-700">
                  New Delivery Partner <span className="text-rose-500">*</span>
                </label>
                <Input
                  required
                  name={isOffline ? "logistics_partner" : "courier_partner"}
                  defaultValue={courierPartner ? `${courierPartner} (Re-attempt)` : ""}
                  placeholder="e.g. Delhivery, BlueDart, DTDC, Shadowfax..."
                  className="h-9 text-xs"
                />
              </div>

              <div>
                <label className="mb-1 block font-bold text-slate-700">
                  New Tracking ID / AWB / LR Number <span className="text-rose-500">*</span>
                </label>
                <Input
                  required
                  name={isOffline ? "lr_number" : "tracking_id"}
                  placeholder="e.g. 1432890123456"
                  className="h-9 font-mono text-xs"
                />
              </div>

              <div>
                <label className="mb-1 block font-bold text-slate-700">
                  New Tracking Link (URL)
                </label>
                <Input
                  type="url"
                  name="tracking_url"
                  placeholder="https://track.courier.com/..."
                  className="h-9 text-xs"
                />
              </div>
            </div>
          )}

          {isRto && (
            <div className="mb-3 rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs text-red-900">
              <p className="font-bold">Return to Origin notice:</p>
              <p className="mt-0.5 text-[11px]">
                This shipment will be flagged as RTO returning to warehouse.
              </p>
            </div>
          )}

          <div className="flex items-center gap-2">
            <ConfirmButton
              message={
                isRto
                  ? `Mark ${orderNumber} as RTO (Return to Origin)?`
                  : isRta
                  ? `Assign new tracking details and re-dispatch ${orderNumber}?`
                  : `Mark delivery as unsuccessful for ${orderNumber}?`
              }
              variant={isRto ? "danger" : isRta ? "warning" : "danger"}
              className={`h-9 flex-1 text-xs font-black ${
                isRto
                  ? "bg-red-600 text-white hover:bg-red-700"
                  : isRta
                  ? "bg-amber-500 text-slate-950 hover:bg-amber-400"
                  : "bg-rose-600 text-white hover:bg-rose-700"
              }`}
            >
              {isRto ? (
                <>
                  <XCircle className="size-4" />
                  CONFIRM RTO (RETURN TO ORIGIN)
                </>
              ) : isRta ? (
                <>
                  <RotateCcw className="size-4" />
                  CONFIRM RTA & RE-ASSIGN
                </>
              ) : (
                <>
                  <AlertTriangle className="size-4" />
                  MARK AS UNSUCCESSFUL
                </>
              )}
            </ConfirmButton>
            <button
              type="button"
              onClick={() => setActiveMode("idle")}
              className="min-h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
