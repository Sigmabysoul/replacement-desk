import { AlertCircle, CheckCircle2, Info } from "lucide-react";

export function Notice({ tone = "error", children }: { tone?: "error" | "warning" | "success"; children?: React.ReactNode }) {
  if (!children) return null;
  const Icon = tone === "success" ? CheckCircle2 : tone === "warning" ? Info : AlertCircle;
  const style = tone === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : tone === "warning" ? "border-amber-200 bg-amber-50 text-amber-950" : "border-rose-200 bg-rose-50 text-rose-900";
  return <div role="status" className={`flex items-start gap-3 rounded-xl border p-3.5 text-sm font-medium ${style}`}><Icon className="mt-0.5 size-5 shrink-0" aria-hidden="true" /><span>{children}</span></div>;
}
