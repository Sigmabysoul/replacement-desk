"use client";

import { useState } from "react";
import { Camera, FileText, CheckCircle2 } from "lucide-react";
import { Field } from "@/components/ui/field";

export function FileInputFeedback({
  name,
  label,
  hint,
  accept,
  iconType = "document",
}: {
  name: string;
  label: string;
  hint?: string;
  accept: string;
  iconType?: "camera" | "document";
}) {
  const [selectedCount, setSelectedCount] = useState<number>(0);
  const [selectedNames, setSelectedNames] = useState<string[]>([]);

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    setSelectedCount(files.length);
    setSelectedNames(files.map((f) => f.name));
  }

  const Icon = iconType === "camera" ? Camera : FileText;

  return (
    <Field label={label} hint={hint}>
      <label className="relative flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-3 text-center transition hover:border-indigo-400 hover:bg-slate-100/50">
        {selectedCount > 0 ? (
          <CheckCircle2 className="size-6 text-emerald-600" />
        ) : (
          <Icon className="size-6 text-indigo-600" />
        )}
        <span className="mt-1 text-sm font-bold text-slate-900">
          {selectedCount === 0
            ? "Choose files"
            : `${selectedCount} file${selectedCount === 1 ? "" : "s"} selected`}
        </span>
        {selectedCount > 0 ? (
          <span className="mt-1 max-w-[200px] truncate text-xs font-medium text-emerald-700">
            {selectedNames.join(", ")}
          </span>
        ) : (
          <span className="text-xs text-slate-500">Tap to select or take photo</span>
        )}
        <input
          type="file"
          name={name}
          accept={accept}
          multiple
          onChange={handleChange}
          className="absolute inset-0 cursor-pointer opacity-0"
          aria-label={label}
        />
      </label>
    </Field>
  );
}
