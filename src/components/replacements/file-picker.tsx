"use client";

import { useState } from "react";
import { Camera, FileText, CheckCircle2 } from "lucide-react";
import { Field } from "@/components/ui/field";
import { compressImage } from "@/lib/image-compression";

/**
 * Touch-friendly file upload picker with real-time compression and selection feedback.
 *
 * Automatically intercepts picked image files, runs client-side compression via HTML5 Canvas,
 * updates the input element's `DataTransfer` file list, and renders selected file badges.
 *
 * @param props.name HTML `<input type="file">` name attribute.
 * @param props.label Accessible form field label text.
 * @param props.hint Optional guidance subtitle text.
 * @param props.accept Allowed MIME types (e.g. `image/jpeg,application/pdf`).
 * @param props.iconType Visual icon style ('camera' or 'document').
 */
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

  async function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const rawFiles = Array.from(event.target.files ?? []);
    if (!rawFiles.length) {
      setSelectedCount(0);
      setSelectedNames([]);
      return;
    }

    const compressedFiles: File[] = [];
    for (const f of rawFiles) {
      if (f.type.startsWith("image/") && f.type !== "image/svg+xml") {
        compressedFiles.push(await compressImage(f));
      } else {
        compressedFiles.push(f);
      }
    }

    try {
      const dt = new DataTransfer();
      for (const f of compressedFiles) {
        dt.items.add(f);
      }
      event.target.files = dt.files;
    } catch {
      // Fallback
    }

    setSelectedCount(compressedFiles.length);
    setSelectedNames(compressedFiles.map((f) => f.name));
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
