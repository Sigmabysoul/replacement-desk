"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PasswordInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  wrapperClassName?: string;
}

export function PasswordInput({
  className,
  wrapperClassName,
  disabled,
  id,
  ...props
}: PasswordInputProps) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className={cn("relative flex items-center w-full", wrapperClassName)}>
      <input
        id={id}
        type={showPassword ? "text" : "password"}
        disabled={disabled}
        className={cn(
          "min-h-12 w-full rounded-xl border border-border bg-card pl-3.5 pr-12 text-base text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-4 focus:ring-ring/15 disabled:opacity-50 disabled:cursor-not-allowed",
          className,
        )}
        {...props}
      />
      <button
        type="button"
        id={id ? `${id}-toggle-visibility` : "password-toggle-visibility"}
        onClick={() => setShowPassword((prev) => !prev)}
        disabled={disabled}
        aria-label={showPassword ? "Hide password" : "Show password"}
        aria-pressed={showPassword}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 grid size-9 place-items-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring transition"
      >
        {showPassword ? (
          <EyeOff className="size-5" aria-hidden="true" />
        ) : (
          <Eye className="size-5" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
