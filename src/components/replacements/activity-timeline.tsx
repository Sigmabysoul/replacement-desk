import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  FileText,
  MessageCircle,
  PackageCheck,
  Printer,
  ShieldAlert,
  Truck,
  XCircle,
} from "lucide-react";
import type { ActivityLog } from "@/lib/types";
import { formatDate } from "@/lib/utils";

const actionCopy: Record<string, string> = {
  REPLACEMENT_CREATED: "Created replacement request",
  LABEL_PRINTED: "Printed the replacement label",
  QC_SUBMITTED: "Submitted QC photos",
  LOGISTICS_SUBMITTED: "Added the shipping label and proof photos",
  QC_REJECTED: "Rejected QC",
  QC_APPROVED: "Approved QC",
  PACKED: "Packed the replacement",
  SHIPPED: "Marked replacement as shipped",
  NEEDS_TOKEN: "Need to raise token",
  COMMENT_ADDED: "Commented",
  FILE_UPLOADED: "Uploaded a file",
  CANCELLED: "Cancelled the replacement",
  REPLACEMENT_UPDATED: "Updated replacement details",
  ADMIN_STATUS_OVERRIDE: "Overrode replacement status",
};

function ActivityIcon({ action }: { action: string }) {
  switch (action) {
    case "LABEL_PRINTED":
      return <Printer className="size-4 text-violet-600" />;
    case "QC_SUBMITTED":
    case "LOGISTICS_SUBMITTED":
      return <Camera className="size-4 text-amber-600" />;
    case "QC_APPROVED":
      return <CheckCircle2 className="size-4 text-emerald-600" />;
    case "QC_REJECTED":
      return <XCircle className="size-4 text-rose-600" />;
    case "PACKED":
      return <PackageCheck className="size-4 text-cyan-600" />;
    case "SHIPPED":
      return <Truck className="size-4 text-slate-700" />;
    case "NEEDS_TOKEN":
      return <AlertTriangle className="size-4 text-orange-600" />;
    case "COMMENT_ADDED":
      return <MessageCircle className="size-4 text-indigo-600" />;
    case "FILE_UPLOADED":
      return <FileText className="size-4 text-slate-600" />;
    case "ADMIN_STATUS_OVERRIDE":
      return <ShieldAlert className="size-4 text-rose-600" />;
    default:
      return <CheckCircle2 className="size-4 text-indigo-600" />;
  }
}

export function ActivityTimeline({ activities }: { activities: ActivityLog[] }) {
  if (!activities.length) {
    return <p className="text-sm text-slate-500">No activity recorded yet.</p>;
  }

  return (
    <div className="grid gap-0">
      {activities.map((activity, index) => {
        const isComment = activity.action === "COMMENT_ADDED";
        const isRejection = activity.action === "QC_REJECTED";
        const isApproved = activity.action === "QC_APPROVED";
        const isPacked = activity.action === "PACKED";
        const isShipped = activity.action === "SHIPPED";

        let bubbleStyle = "bg-slate-50 border-slate-100";
        if (isComment) bubbleStyle = "bg-white border-indigo-200 shadow-sm";
        else if (isRejection) bubbleStyle = "bg-rose-50/60 border-rose-200";
        else if (isApproved) bubbleStyle = "bg-emerald-50/50 border-emerald-200";
        else if (isPacked) bubbleStyle = "bg-cyan-50/50 border-cyan-200";
        else if (isShipped) bubbleStyle = "bg-slate-100/60 border-slate-200";

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
                    {activity.actor?.full_name ?? "System"}
                  </strong>
                  {activity.actor?.role && (
                    <span className="rounded-md bg-slate-200/70 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-slate-700">
                      {activity.actor.role}
                    </span>
                  )}
                </div>
                <time className="text-xs text-slate-500">
                  {formatDate(activity.created_at)}
                </time>
              </div>

              <p className="mt-1 text-sm font-semibold text-slate-800">
                {actionCopy[activity.action] ?? activity.action.replaceAll("_", " ").toLowerCase()}
                {activity.metadata && typeof activity.metadata.photo_count === "number" && (
                  <span className="ml-1 text-xs font-normal text-slate-600">
                    ({activity.metadata.photo_count} photo{activity.metadata.photo_count === 1 ? "" : "s"})
                  </span>
                )}
              </p>

              {activity.message && (
                <div
                  className={`mt-2 rounded-xl p-3 text-sm ${
                    isComment
                      ? "bg-slate-50 text-slate-800"
                      : isRejection
                      ? "border-l-4 border-rose-500 bg-white font-medium text-rose-950"
                      : "border-l-2 border-indigo-400 bg-white text-slate-700"
                  }`}
                >
                  {isRejection ? `“${activity.message}”` : activity.message}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
