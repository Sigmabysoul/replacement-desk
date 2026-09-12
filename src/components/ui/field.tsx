import * as React from "react";
import { cn } from "@/lib/utils";

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className="grid gap-2 text-sm font-semibold text-slate-800"><span>{label}</span>{children}{hint && <span className="text-xs font-normal leading-5 text-slate-500">{hint}</span>}</label>;
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "min-h-12 w-full appearance-none rounded-xl border border-border bg-card px-3.5 text-base text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-4 focus:ring-ring/15",
        props.className,
      )}
      {...props}
    />
  );
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn("min-h-28 w-full resize-y rounded-xl border border-border bg-card px-3.5 py-3 text-base text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-4 focus:ring-ring/15", props.className)} {...props} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn("min-h-12 w-full rounded-xl border border-border bg-card px-3.5 text-base text-foreground outline-none focus:border-ring focus:ring-4 focus:ring-ring/15", props.className)} {...props} />;
}

export { PasswordInput } from "@/components/ui/password-input";
