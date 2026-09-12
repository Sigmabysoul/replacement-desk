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
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold tracking-[0.01em] transition active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-55 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/20",
        variant === "primary" && "bg-primary text-primary-foreground shadow-sm hover:brightness-95",
        variant === "secondary" && "border border-border bg-card text-card-foreground hover:bg-muted",
        variant === "danger" && "bg-rose-600 text-white hover:bg-rose-700",
        variant === "warning" && "bg-amber-500 text-slate-950 hover:bg-amber-400",
        variant === "ghost" && "text-muted-foreground hover:bg-muted hover:text-foreground",
        size === "large" && "min-h-14 w-full px-5 text-base",
        size === "icon" && "size-11 p-0",
        className,
      )}
      {...props}
    />
  );
}
