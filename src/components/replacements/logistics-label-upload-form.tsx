"use client";

import { useState } from "react";
import { FileText, Upload } from "lucide-react";
import { SubmitButton } from "@/components/ui/submit-button";

/** Lets Logistics attach the one shipping label required before Printing can act. */
export function LogisticsLabelUploadForm({
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
        <p className="font-bold text-indigo-950">Upload the shipping label</p>
        <p className="mt-1 text-sm text-indigo-800">
          Printing will be notified after the label is securely attached to this order.
        </p>
      </div>
      <label className="relative flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-4 text-center transition hover:border-indigo-400">
        <FileText className="size-7 text-indigo-600" />
        <span className="mt-2 text-sm font-bold text-slate-900">
          {labelName || "CHOOSE SHIPPING LABEL"}
        </span>
        <span className="mt-1 text-xs text-slate-500">PDF, JPEG, PNG, or WebP; one file up to 25 MB</span>
        <input
          type="file"
          name="label"
          required
          accept="application/pdf,image/jpeg,image/png,image/webp"
          onChange={(event) => setLabelName(event.target.files?.[0]?.name ?? "")}
          className="absolute inset-0 cursor-pointer opacity-0"
          aria-label="Shipping label"
        />
      </label>
      <SubmitButton disabled={!labelName} pendingText="Uploading label…">
        <Upload className="size-5" />
        SUBMIT LABEL TO PRINTING
      </SubmitButton>
    </form>
  );
}
