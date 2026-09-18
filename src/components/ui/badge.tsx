import { Circle } from "lucide-react";
import type { OfflineOrderStatus, ReplacementStatus } from "@/lib/types";
import { cn, offlineStatusLabel, offlineStatusTone, statusLabel, statusTone } from "@/lib/utils";

export function StatusBadge({ status, className }: { status: ReplacementStatus; className?: string }) {
  return <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset", statusTone[status], className)}><Circle className="size-2 fill-current" aria-hidden="true" />{statusLabel[status]}</span>;
}

export function OfflineStatusBadge({ status, className }: { status: OfflineOrderStatus; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset", offlineStatusTone[status], className)}>
      <Circle className="size-2 fill-current" aria-hidden="true" />
      {offlineStatusLabel[status]}
    </span>
  );
}

export { StatusBadge as ReplacementStatusBadge };
