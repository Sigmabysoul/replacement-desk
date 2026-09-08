"use client";

import { useFormStatus } from "react-dom";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SubmitButton({
  children,
  pendingText = "Saving…",
  variant = "primary",
  className,
  disabled = false,
}: {
  children: React.ReactNode;
  pendingText?: string;
  variant?: "primary" | "secondary" | "danger" | "warning";
  className?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size="large"
      variant={variant}
      className={className}
      disabled={disabled || pending}
    >
      {pending && <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />}
      {pending ? pendingText : children}
    </Button>
  );
}
