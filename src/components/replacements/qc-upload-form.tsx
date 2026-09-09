"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Camera, Send, Trash2, AlertCircle } from "lucide-react";
import { SubmitButton } from "@/components/ui/submit-button";
import { MAX_FILE_SIZE } from "@/lib/replacements/validation";
import { compressImage } from "@/lib/image-compression";

interface SelectedPhoto {
  id: string;
  file: File;
  previewUrl: string;
}

/**
 * Interactive camera and photo upload form for warehouse quality control (QC).
 *
 * Features:
 * - Direct camera capture support on mobile (`capture="environment"`).
 * - Client-side automatic image compression via Canvas to avoid server payload limits.
 * - Thumbnail previews with individual deletion.
 * - `DataTransfer` synchronization with the native form `<input type="file">` payload.
 * - Enforces 1 to 12 photo boundary and 25MB per-file size guard.
 *
 * @param props.replacementId Target replacement order UUID.
 * @param props.action Next.js server action to execute upon submission (`submitQcAction`).
 */
export function QcUploadForm({
  replacementId,
  action,
}: {
  replacementId: string;
  action: (formData: FormData) => Promise<void>;
}) {
  const [photos, setPhotos] = useState<SelectedPhoto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

  // Sync photos to file input using DataTransfer
  useEffect(() => {
    if (!inputRef.current) return;
    try {
      const dt = new DataTransfer();
      for (const p of photos) {
        dt.items.add(p.file);
      }
      inputRef.current.files = dt.files;
    } catch {
      // Fallback for browsers that don't allow modifying DataTransfer
    }
  }, [photos]);

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      photos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    };
  }, [photos]);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const selectedFiles = Array.from(event.target.files ?? []);
    if (!selectedFiles.length) return;

    if (photos.length + selectedFiles.length > 12) {
      setError("You can upload a maximum of 12 QC photos.");
      return;
    }

    const validNewPhotos: SelectedPhoto[] = [];
    for (const rawFile of selectedFiles) {
      if (rawFile.size > MAX_FILE_SIZE) {
        setError(`"${rawFile.name}" exceeds 25 MB limit.`);
        return;
      }
      if (!["image/jpeg", "image/png", "image/webp"].includes(rawFile.type)) {
        setError(`"${rawFile.name}" is not a supported image (use JPEG, PNG, or WebP).`);
        return;
      }
      const file = await compressImage(rawFile);
      validNewPhotos.push({
        id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
        file,
        previewUrl: URL.createObjectURL(file),
      });
    }

    setPhotos((prev) => [...prev, ...validNewPhotos]);
    // Reset file input value so selecting the same file again triggers onChange
    event.target.value = "";
  }

  function removePhoto(id: string) {
    setPhotos((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  }

  return (
    <form ref={formRef} action={action} className="grid gap-4">
      <input type="hidden" name="replacement_id" value={replacementId} />
      {/* Hidden file input synchronized with selected photos */}
      <input
        ref={inputRef}
        type="file"
        name="qc_photos"
        multiple
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />

      <div className="rounded-xl bg-indigo-50 p-4">
        <p className="font-bold text-indigo-950">Before packing, complete quality check</p>
        <p className="mt-1 text-sm text-indigo-800">
          Take clear photos showing the product, label, and packaging condition.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-900">
          <AlertCircle className="size-5 shrink-0 text-rose-600" />
          <span>{error}</span>
        </div>
      )}

      {/* Upload trigger button */}
      <div>
        <label className="relative flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-indigo-300 bg-indigo-50/70 p-4 text-center transition hover:border-indigo-500 hover:bg-indigo-50">
          <Camera className="size-8 text-indigo-600" />
          <span className="mt-2 text-base font-black text-indigo-950">
            {photos.length === 0 ? "TAKE / UPLOAD QC PHOTO" : "ADD MORE QC PHOTOS"}
          </span>
          <span className="mt-1 text-xs text-indigo-700">
            Supports camera or gallery. Photos auto-optimized for high-speed upload.
          </span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            multiple
            onChange={handleFileChange}
            className="absolute inset-0 cursor-pointer opacity-0"
            aria-label="Upload QC photos"
          />
        </label>
      </div>

      {/* Previews gallery */}
      {photos.length > 0 && (
        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              {photos.length} Photo{photos.length === 1 ? "" : "s"} ready for approval
            </span>
            <span className="text-xs text-slate-500">Tap trash icon to remove</span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {photos.map((photo, index) => (
              <div
                key={photo.id}
                className="group relative aspect-square overflow-hidden rounded-xl border border-slate-200 bg-slate-100"
              >
                <Image
                  src={photo.previewUrl}
                  alt={`QC preview ${index + 1}`}
                  fill
                  unoptimized
                  className="object-cover"
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                  <p className="truncate text-[11px] font-medium text-white">
                    {photo.file.size < 1024 * 1024
                      ? `${(photo.file.size / 1024).toFixed(0)} KB (optimized)`
                      : `${(photo.file.size / (1024 * 1024)).toFixed(1)} MB`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => removePhoto(photo.id)}
                  aria-label={`Remove photo ${index + 1}`}
                  className="absolute right-2 top-2 grid size-8 place-items-center rounded-lg bg-rose-600/90 text-white shadow hover:bg-rose-700"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Submit Button */}
      <SubmitButton
        disabled={photos.length === 0}
        pendingText="Submitting QC photos…"
        className="w-full"
      >
        <Send className="size-5" />
        SUBMIT FOR APPROVAL {photos.length > 0 ? `(${photos.length})` : ""}
      </SubmitButton>
    </form>
  );
}
