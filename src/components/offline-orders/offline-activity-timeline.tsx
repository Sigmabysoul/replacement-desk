import {
  Boxes,
  Check,
  CheckCircle2,
  FileText,
  MessageCircle,
  PackageCheck,
  Printer,
  Truck,
  XCircle,
} from "lucide-react";
import type { OfflineOrderActivityLog } from "@/lib/types";
import { formatDate } from "@/lib/utils";

const actionCopy: Record<string, string> = {
  ORDER_CREATED: "Created offline order",
  PACKING_CONFIRMED: "Confirmed packing & carton dimensions",
  DISPATCH_PREPARED: "Prepared dispatch details & uploaded photos",
  PRINTING_CONFIRMED: "Confirmed materials / labels printed",
  ORDER_DISPATCHED: "Dispatched shipment with LR & tracking",
  PICKUP_CONFIRMED: "Confirmed courier pickup",
  DELIVERY_CONFIRMED: "Confirmed delivery & Proof of Delivery (POD)",
  ORDER_ACKNOWLEDGED: "Acknowledged completed order",
  ORDER_CANCELLED: "Cancelled the order",
  COMMENT_ADDED: "Commented",
};

function ActivityIcon({ action }: { action: string }) {
  switch (action) {
    case "ORDER_CREATED":
      return <Boxes className="size-4 text-indigo-600" />;
    case "PACKING_CONFIRMED":
      return <PackageCheck className="size-4 text-violet-600" />;
    case "DISPATCH_PREPARED":
      return <Truck className="size-4 text-amber-600" />;
    case "PRINTING_CONFIRMED":
      return <Printer className="size-4 text-fuchsia-600" />;
    case "ORDER_DISPATCHED":
      return <Truck className="size-4 text-amber-600" />;
    case "PICKUP_CONFIRMED":
      return <Check className="size-4 text-cyan-600" />;
    case "DELIVERY_CONFIRMED":
      return <CheckCircle2 className="size-4 text-emerald-600" />;
    case "ORDER_ACKNOWLEDGED":
      return <CheckCircle2 className="size-4 text-slate-700" />;
    case "ORDER_CANCELLED":
      return <XCircle className="size-4 text-rose-600" />;
    case "COMMENT_ADDED":
      return <MessageCircle className="size-4 text-indigo-600" />;
    default:
      return <FileText className="size-4 text-slate-500" />;
  }
}

export function OfflineActivityTimeline({ activities }: { activities: OfflineOrderActivityLog[] }) {
  if (!activities.length) {
    return <p className="text-sm text-slate-500">No activity recorded yet.</p>;
  }

  return (
    <div className="grid gap-0">
      {activities.map((activity, index) => {
        const isComment = activity.action === "COMMENT_ADDED";
        const isCancellation = activity.action === "ORDER_CANCELLED";
        const isDelivered = activity.action === "DELIVERY_CONFIRMED";
        const isAcknowledged = activity.action === "ORDER_ACKNOWLEDGED";

        const actorRoleLabel = activity.actor?.roles?.length
          ? activity.actor.roles.join(" + ")
          : activity.actor?.role;
        const actorName = activity.actor?.full_name ?? "System";
        const actorInitial = actorName.charAt(0).toUpperCase();

        if (isComment) {
          return (
            <div key={activity.id} className="relative flex gap-3 pb-5">
              {index < activities.length - 1 && (
                <span
                  className="absolute bottom-0 left-[17px] top-9 w-px bg-slate-200"
                  aria-hidden="true"
                />
              )}
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-indigo-600 text-xs font-black text-white shadow-xs">
                {actorInitial}
              </span>
              <div className="min-w-0 flex-1 rounded-2xl border border-indigo-100 bg-white p-4 shadow-xs">
                <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                  <div className="flex items-center gap-1.5">
                    <strong className="text-sm font-black text-slate-900">{actorName}</strong>
                    {actorRoleLabel && (
                      <span className="rounded-md bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-700">
                        {actorRoleLabel}
                      </span>
                    )}
                  </div>
                  <time className="text-xs text-slate-400">
                    {formatDate(activity.created_at)}
                  </time>
                </div>

                <div className="mt-2 text-sm leading-relaxed text-slate-800 whitespace-pre-wrap">
                  {activity.message}
                </div>
              </div>
            </div>
          );
        }

        let bubbleStyle = "bg-slate-50 border-slate-100";
        if (isCancellation) bubbleStyle = "bg-rose-50/60 border-rose-200";
        else if (isDelivered || isAcknowledged) bubbleStyle = "bg-emerald-50/50 border-emerald-200";

        return (
          <div key={activity.id} className="relative flex gap-3 pb-5">
            {index < activities.length - 1 && (
              <span
                className="absolute bottom-0 left-[17px] top-9 w-px bg-slate-200"
                aria-hidden="true"
              />
            )}
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white shadow-xs ring-1 ring-slate-200">
              <ActivityIcon action={activity.action} />
            </span>
            <div className={`min-w-0 flex-1 rounded-2xl rounded-tl-xs border p-3.5 sm:p-4 ${bubbleStyle}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                <div className="flex items-center gap-1.5">
                  <strong className="text-sm font-bold text-slate-950">
                    {actorName}
                  </strong>
                  {actorRoleLabel && (
                    <span className="rounded-md bg-slate-200/70 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-700">
                      {actorRoleLabel}
                    </span>
                  )}
                </div>
                <time className="text-xs text-slate-400">
                  {formatDate(activity.created_at)}
                </time>
              </div>

              <p className="mt-1 text-sm font-semibold text-slate-700">
                {actionCopy[activity.action] ?? activity.action}
              </p>

              {activity.message && (
                <div className="mt-2 rounded-xl bg-white/80 p-3 text-sm text-slate-800 ring-1 ring-slate-200/50">
                  {activity.message}
                </div>
              )}

              {activity.metadata && Object.keys(activity.metadata).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                  {activity.metadata.carton_count != null && (
                    <span className="rounded-md bg-white px-2 py-0.5 ring-1 ring-slate-200">
                      Boxes: <strong>{String(activity.metadata.carton_count)}</strong>
                    </span>
                  )}
                  {activity.metadata.carton_dimensions != null && (
                    <span className="rounded-md bg-white px-2 py-0.5 ring-1 ring-slate-200">
                      Dimensions: <strong>{String(activity.metadata.carton_dimensions)}</strong>
                    </span>
                  )}
                  {activity.metadata.carton_weight_kg != null && (
                    <span className="rounded-md bg-white px-2 py-0.5 ring-1 ring-slate-200">
                      Weight: <strong>{String(activity.metadata.carton_weight_kg)} KG</strong>
                    </span>
                  )}
                  {activity.metadata.lr_number != null && (
                    <span className="rounded-md bg-white px-2 py-0.5 ring-1 ring-slate-200">
                      LR: <strong>{String(activity.metadata.lr_number)}</strong>
                    </span>
                  )}
                  {activity.metadata.attachment_count != null && Number(activity.metadata.attachment_count) > 0 && (
                    <span className="rounded-md bg-white px-2 py-0.5 ring-1 ring-slate-200">
                      Photos/Docs: <strong>{String(activity.metadata.attachment_count)}</strong>
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
