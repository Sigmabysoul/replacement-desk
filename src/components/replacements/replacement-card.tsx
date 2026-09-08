import Link from "next/link";
import { ArrowRight, CalendarDays, Package } from "lucide-react";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import type { Replacement, Role } from "@/lib/types";
import { formatDate } from "@/lib/utils";

function actionHint(status: Replacement["status"], role: Role) {
  if (status === "NEW") return role === "PRINTING" || role === "ADMIN" ? "Print the label" : "Waiting for printing";
  if (status === "LABEL_PRINTED" || status === "QC_REJECTED") return role === "PACKING" || role === "ADMIN" ? "Submit QC photos" : "Waiting for QC";
  if (status === "QC_PENDING") return role === "ESHA" || role === "ADMIN" ? "Review QC" : "Waiting for review";
  if (status === "QC_APPROVED") return role === "PACKING" || role === "ADMIN" ? "Pack replacement" : "Ready to pack";
  if (status === "PACKED") return role === "ESHA" || role === "ADMIN" ? "Complete dispatch" : "Ready for dispatch";
  if (status === "NEEDS_TOKEN") return "Follow up on token";
  return "View history";
}

export function ReplacementCard({ replacement, role }: { replacement: Replacement; role: Role }) {
  return <Card className="p-4 transition hover:border-indigo-200 hover:shadow-md sm:p-5"><div className="flex items-start justify-between gap-3"><div><Link href={`/replacements/${replacement.id}`} className="font-black tracking-tight text-slate-950 hover:text-indigo-700">{replacement.replacement_number}</Link><p className="mt-1 flex items-center gap-2 text-base font-semibold text-slate-800"><Package className="size-4 shrink-0 text-slate-400" />{replacement.product_name} <span className="text-slate-500">× {replacement.quantity}</span></p></div><StatusBadge status={replacement.status} /></div><div className="mt-4 flex items-end justify-between gap-4 border-t border-slate-100 pt-3"><div><p className="text-sm font-bold text-indigo-700">{actionHint(replacement.status, role)}</p><p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500"><CalendarDays className="size-3.5" />{formatDate(replacement.created_at)}</p></div><Link href={`/replacements/${replacement.id}`} aria-label={`Open ${replacement.replacement_number}`} className="grid size-11 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-700 hover:bg-indigo-600 hover:text-white"><ArrowRight className="size-5" /></Link></div></Card>;
}
