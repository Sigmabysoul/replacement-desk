"use client";

import { useFormStatus } from "react-dom";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ConfirmButton({
  children,
  message,
  variant = "primary",
  pendingText = "Processing…",
  className,
}: {
  children: React.ReactNode;
  message: string;
  variant?: "primary" | "danger" | "warning" | "secondary";
  pendingText?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      size="large"
      variant={variant}
      className={className}
      disabled={pending}
      onClick={(event) => {
        try {
          if (typeof window !== "undefined" && typeof window.confirm === "function") {
            if (!window.confirm(message)) {
              event.preventDefault();
            }
          }
        } catch {
          // Allow submission to continue if modal prompt is blocked by iframe policy
        }
      }}
    >
      {pending && <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />}
      {pending ? pendingText : children}
    </Button>
  );
}
