import Link from "next/link";
import { ArrowRight, Boxes, CalendarDays, Truck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { OfflineStatusBadge } from "@/components/ui/badge";
import type { OfflineOrder, Role } from "@/lib/types";
import { formatDate } from "@/lib/utils";

function actionHint(status: OfflineOrder["status"], roles: readonly Role[]): string {
  const hasRole = (role: Role) => roles.includes("ADMIN") || roles.includes(role);

  switch (status) {
    case "CREATED":
      return hasRole("CONSIGNMENT") ? "Confirm packing & dimensions" : "Waiting for packing confirmation";
    case "PACKING_CONFIRMED":
      return hasRole("HR") ? "Prepare dispatch & attach photos" : "Waiting for dispatch details";
    case "DISPATCH_PREPARED":
      return hasRole("PRINTING") ? "Confirm printing done" : "Waiting for printing";
    case "PRINTED":
      return hasRole("CONSIGNMENT") ? "Confirm pickup done" : "Waiting for courier pickup";
    case "PICKED_UP":
      return hasRole("HR") ? "Confirm delivery & attach POD" : "In transit";
    case "DELIVERED":
      return hasRole("BOSS") ? "Acknowledge delivery" : "Delivered";
    case "ACKNOWLEDGED":
      return "Completed & noted";
    case "CANCELLED":
      return "Order cancelled";
    default:
      return "View details";
  }
}

export function OfflineOrderCard({
  order,
  role,
  roles,
}: {
  order: OfflineOrder;
  role?: Role;
  roles?: Role[];
}) {
  const userRoles = roles?.length ? roles : role ? [role] : [];

  return (
    <Link
      href={`/offline-orders/${order.id}`}
      aria-label={`Open offline order ${order.so_number}`}
      className="group block rounded-2xl outline-none focus-visible:ring-4 focus-visible:ring-indigo-200"
    >
      <Card className="h-full cursor-pointer overflow-hidden p-3.5 transition hover:border-indigo-300 hover:shadow-md sm:p-5">
        <div className="flex items-start justify-between gap-2.5 min-w-0">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-black text-indigo-700">
                SO: {order.so_number}
              </span>
              {order.brand && (
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-700">
                  {order.brand}
                </span>
              )}
            </div>
            <p className="mt-1 truncate text-xs font-semibold text-slate-500">
              #{order.order_number} · Offline Order
            </p>
            <p className="mt-2 flex items-center gap-1.5 text-sm sm:text-base font-semibold text-slate-800 min-w-0">
              <Boxes className="size-4 shrink-0 text-slate-400" />
              <span className="truncate">{order.product_name}</span>
              <span className="shrink-0 text-slate-500 text-xs sm:text-sm">
                × {order.quantity} {order.unit}
              </span>
            </p>
            {order.logistics_partner && (
              <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500 truncate">
                <Truck className="size-3.5 shrink-0 text-slate-400" />
                <span className="truncate">Partner: {order.logistics_partner}</span>
                {order.lr_number && <span className="shrink-0 font-semibold text-slate-700">· LR: {order.lr_number}</span>}
              </p>
            )}
          </div>
          <OfflineStatusBadge status={order.status} className="shrink-0 text-[11px] sm:text-xs" />
        </div>

        <div className="mt-4 flex items-end justify-between gap-3 border-t border-slate-100 pt-3 min-w-0">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs sm:text-sm font-bold text-indigo-700">{actionHint(order.status, userRoles)}</p>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500 truncate">
              <CalendarDays className="size-3.5 shrink-0" />
              {formatDate(order.created_at)}
            </p>
          </div>
          <span
            aria-hidden="true"
            className="grid size-9 sm:size-11 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-700 transition group-hover:bg-indigo-600 group-hover:text-white"
          >
            <ArrowRight className="size-5" />
          </span>
        </div>
      </Card>
    </Link>
  );
}

