"use client";

import { useState } from "react";
import { FileText, Send } from "lucide-react";
import { SubmitButton } from "@/components/ui/submit-button";
import { Field, Input } from "@/components/ui/field";

/** Collects Logistics' single shipping-label file before Printing takes over. */
export function LogisticsUploadForm({
  replacementId,
  action,
}: {
  replacementId: string;
  action: (formData: FormData) => Promise<void>;
}) {
  const [labelName, setLabelName] = useState("");

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="replacement_id" value={replacementId} />

      <div className="rounded-xl bg-indigo-50 p-4">
        <p className="font-bold text-indigo-950">Add the shipping label</p>
        <p className="mt-1 text-sm text-indigo-800">customer_support already attached the product photos when creating this order.</p>
      </div>

      <Field label="Tracking link (optional)" hint="Logistics owns this field. Paste the courier or marketplace tracking URL.">
        <Input name="tracking_url" type="url" inputMode="url" maxLength={2000} placeholder="https://tracking.example.com/..." />
      </Field>

      <label className="relative flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-3 text-center transition hover:border-indigo-400">
        <FileText className="size-6 text-indigo-600" />
        <span className="mt-1 text-sm font-bold text-slate-900">
          {labelName || "CHOOSE SHIPPING LABEL"}
        </span>
        <span className="text-xs text-slate-500">PDF, JPEG, PNG, or WebP; one file up to 25 MB</span>
        <input
          type="file"
          name="labels"
          required
          accept="application/pdf,image/jpeg,image/png,image/webp"
          onChange={(event) => setLabelName(event.target.files?.[0]?.name ?? "")}
          className="absolute inset-0 cursor-pointer opacity-0"
          aria-label="Shipping label (required)"
        />
      </label>

      <SubmitButton disabled={!labelName} pendingText="Submitting label…">
        <Send className="size-5" />
        SUBMIT TO PRINTING
      </SubmitButton>
    </form>
  );
}
