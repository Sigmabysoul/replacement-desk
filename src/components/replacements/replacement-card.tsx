import Link from "next/link";
import { ArrowRight, CalendarDays, Package } from "lucide-react";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import type { Replacement, Role } from "@/lib/types";
import { formatDate } from "@/lib/utils";

/**
 * Generates an intuitive next-step guidance label customized for the viewer's active role.
 * E.g., for a NEW order, Logistics sees "Upload shipping label" while Esha waits.
 *
 * @param status Current operational status of the replacement.
 * @param role Active user's department role.
 * @returns Short human-readable status cue.
 */
function actionHint(status: Replacement["status"], role: Role) {
  if (status === "NEW") return role === "LOGISTICS" || role === "ADMIN" ? "Upload shipping label" : "Waiting for logistics";
  if (status === "LABEL_UPLOADED") return role === "PRINTING" || role === "ADMIN" ? "Print the label" : "Waiting for printing";
  if (status === "LABEL_PRINTED") return role === "PACKING" || role === "ADMIN" ? "Request Esha QC" : "Waiting for packing QC";
  if (status === "QC_REJECTED") return role === "PACKING" || role === "ADMIN" ? "Resubmit QC pictures" : "Waiting for packing QC";
  if (status === "QC_PENDING") return role === "ESHA" || role === "ADMIN" ? "Review QC" : "Waiting for review";
  if (status === "QC_APPROVED") return role === "PACKING" || role === "ADMIN" ? "Pack replacement" : "Ready to pack";
  if (status === "PACKED") return role === "PACKING" || role === "ADMIN" ? "Complete dispatch" : "Ready for dispatch";
  if (status === "NEEDS_TOKEN") return "Follow up on token";
  return "View history";
}

/**
 * Summary card for an individual replacement order displayed on queues and dashboards.
 *
 * Displays order reference, item details, status badge, role-tailored action hint,
 * creation date, and direct navigation link.
 *
 * @param props.replacement Order record.
 * @param props.role Viewer's department role.
 */
export function ReplacementCard({ replacement, role }: { replacement: Replacement; role: Role }) {
  return (
    <Link
      href={`/replacements/${replacement.id}`}
      aria-label={`Open replacement order ${replacement.order_reference}`}
      className="group block rounded-2xl outline-none focus-visible:ring-4 focus-visible:ring-indigo-200"
    >
      <Card className="h-full cursor-pointer p-4 transition hover:border-indigo-300 hover:shadow-md sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-black tracking-tight text-slate-950">{replacement.order_reference}</p>
            <p className="mt-0.5 text-xs font-semibold text-slate-500">{replacement.replacement_number}</p>
            <p className="mt-2 flex items-center gap-2 text-base font-semibold text-slate-800">
              <Package className="size-4 shrink-0 text-slate-400" />
              <span className="truncate">{replacement.product_name}</span>
              <span className="shrink-0 text-slate-500">× {replacement.quantity}</span>
            </p>
          </div>
          <StatusBadge status={replacement.status} />
        </div>
        <div className="mt-4 flex items-end justify-between gap-4 border-t border-slate-100 pt-3">
          <div>
            <p className="text-sm font-bold text-indigo-700">{actionHint(replacement.status, role)}</p>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500"><CalendarDays className="size-3.5" />{formatDate(replacement.created_at)}</p>
          </div>
          <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-700 transition group-hover:bg-indigo-600 group-hover:text-white">
            <ArrowRight className="size-5" />
          </span>
        </div>
      </Card>
    </Link>
  );
}
