"use client";

import { useRef, useState } from "react";
import { FileText, Send, Truck, UploadCloud, X } from "lucide-react";
import { SubmitButton } from "@/components/ui/submit-button";
import { Field, Input } from "@/components/ui/field";

const COMMON_COURIERS = [
  "Delhivery",
  "Blue Dart",
  "DTDC",
  "SafeXpress",
  "Amazon Shipping",
  "Shadowfax",
];

/** Collects Logistics' shipping label, Courier Partner, Tracking ID, and Tracking link before Printing takes over. */
export function LogisticsUploadForm({
  replacementId,
  action,
}: {
  replacementId: string;
  action: (formData: FormData) => Promise<void>;
}) {
  const [courier, setCourier] = useState("");
  const [trackingId, setTrackingId] = useState("");
  const [labelFile, setLabelFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setLabelFile(file);
  }

  function handleClearFile() {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    setLabelFile(null);
  }

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="replacement_id" value={replacementId} />

      <div className="rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4 text-xs text-indigo-950">
        <div className="flex items-center gap-2 font-black text-indigo-900 text-sm">
          <Truck className="size-4 text-indigo-600" />
          <span>Logistics Dispatch Preparation</span>
        </div>
        <p className="mt-1 text-indigo-800">
          Assign the courier partner, enter tracking details, and attach the shipping label to send this order to the Printing team.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Field label="Courier Partner" hint="Select or type courier">
            <Input
              name="courier_partner"
              required
              value={courier}
              onChange={(e) => setCourier(e.target.value)}
              maxLength={100}
              placeholder="e.g. Delhivery, Blue Dart..."
            />
          </Field>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {COMMON_COURIERS.map((partner) => (
              <button
                key={partner}
                type="button"
                onClick={() => setCourier(partner)}
                className={`rounded-lg px-2 py-0.5 text-[11px] font-bold transition ${
                  courier === partner
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {partner}
              </button>
            ))}
          </div>
        </div>

        <div>
          <Field label="Tracking ID / AWB Number" hint="Docket or tracking number">
            <Input
              name="tracking_id"
              value={trackingId}
              onChange={(e) => setTrackingId(e.target.value)}
              maxLength={100}
              placeholder="e.g. 1421098234 / AWB12345"
            />
          </Field>
        </div>
      </div>

      <Field
        label="Tracking Link (optional)"
        hint="Direct link to track shipment online (must begin with https://)"
      >
        <Input
          name="tracking_url"
          type="url"
          inputMode="url"
          maxLength={2000}
          placeholder="https://delhivery.com/track/..."
        />
      </Field>

      <div>
        <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-700">
          Shipping Label <span className="text-rose-500">*</span>
        </label>
        
        <input
          ref={fileInputRef}
          type="file"
          name="labels"
          required
          accept="application/pdf,image/jpeg,image/png,image/webp"
          onChange={handleFileChange}
          className="sr-only"
          id="shipping-label-upload"
          aria-label="Shipping label (required)"
        />

        {labelFile ? (
          <div className="flex items-center justify-between rounded-xl border border-indigo-200 bg-indigo-50/50 p-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="grid size-9 place-items-center rounded-lg bg-indigo-100 text-indigo-700 shrink-0">
                <FileText className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-xs font-bold text-slate-900">{labelFile.name}</p>
                <p className="text-[11px] text-slate-500">{(labelFile.size / 1024).toFixed(1)} KB</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleClearFile}
              className="grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
              aria-label="Remove label"
            >
              <X className="size-4" />
            </button>
          </div>
        ) : (
          <label
            htmlFor="shipping-label-upload"
            className="flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50/60 p-4 text-center transition hover:border-indigo-400 hover:bg-indigo-50/30"
          >
            <UploadCloud className="size-7 text-indigo-600" />
            <span className="mt-2 text-xs font-bold text-slate-900">
              CLICK OR DRAG SHIPPING LABEL HERE
            </span>
            <span className="mt-0.5 text-[11px] text-slate-500">PDF, JPEG, PNG, or WebP up to 25 MB</span>
          </label>
        )}
      </div>

      <SubmitButton disabled={!labelFile || !courier.trim()} pendingText="Submitting label…">
        <Send className="size-5" />
        SUBMIT TO PRINTING TEAM
      </SubmitButton>
    </form>
  );
}
