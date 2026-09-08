import * as React from "react";
import { cn } from "@/lib/utils";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "warning" | "ghost";
  size?: "default" | "large" | "icon";
};

export function Button({ className, variant = "primary", size = "default", ...props }: Props) {
  return (
    <button
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold tracking-[0.01em] transition active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-55 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-200",
        variant === "primary" && "bg-indigo-600 text-white shadow-sm hover:bg-indigo-700",
        variant === "secondary" && "border border-slate-200 bg-white text-slate-800 hover:bg-slate-50",
        variant === "danger" && "bg-rose-600 text-white hover:bg-rose-700",
        variant === "warning" && "bg-amber-500 text-slate-950 hover:bg-amber-400",
        variant === "ghost" && "text-slate-600 hover:bg-slate-100",
        size === "large" && "min-h-14 w-full px-5 text-base",
        size === "icon" && "size-11 p-0",
        className,
      )}
      {...props}
    />
  );
}
