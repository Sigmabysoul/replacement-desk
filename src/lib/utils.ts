import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { ReplacementStatus } from "@/lib/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const statusLabel: Record<ReplacementStatus, string> = {
  NEW: "New",
  LABEL_PRINTED: "Label printed",
  QC_PENDING: "QC pending",
  QC_REJECTED: "QC rejected",
  QC_APPROVED: "QC approved",
  PACKED: "Packed",
  SHIPPED: "Shipped",
  NEEDS_TOKEN: "Needs token",
  CANCELLED: "Cancelled",
};

export const statusTone: Record<ReplacementStatus, string> = {
  NEW: "bg-blue-50 text-blue-800 ring-blue-200",
  LABEL_PRINTED: "bg-violet-50 text-violet-800 ring-violet-200",
  QC_PENDING: "bg-amber-50 text-amber-900 ring-amber-200",
  QC_REJECTED: "bg-rose-50 text-rose-800 ring-rose-200",
  QC_APPROVED: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  PACKED: "bg-cyan-50 text-cyan-900 ring-cyan-200",
  SHIPPED: "bg-slate-100 text-slate-700 ring-slate-200",
  NEEDS_TOKEN: "bg-orange-50 text-orange-900 ring-orange-200",
  CANCELLED: "bg-slate-100 text-slate-500 ring-slate-200",
};

export function formatDate(value: string, withTime = true) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(new Date(value));
}

export function safeFileName(name: string) {
  const clean = name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/-\./g, ".")
    .replace(/\.-/g, ".")
    .replace(/^-+|-+$/g, "");
  return clean.slice(-100) || "upload";
}
