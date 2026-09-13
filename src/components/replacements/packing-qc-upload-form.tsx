"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { AlertCircle, Camera, Send, Trash2 } from "lucide-react";
import { SubmitButton } from "@/components/ui/submit-button";
import { compressImage } from "@/lib/image-compression";
import { MAX_FILE_SIZE } from "@/lib/replacements/validation";

interface SelectedPhoto {
  id: string;
  file: File;
  previewUrl: string;
}

/** Collects Packing's immutable QC evidence before Esha reviews the order. */
export function PackingQcUploadForm({
  replacementId,
  action,
}: {
  replacementId: string;
  action: (formData: FormData) => Promise<void>;
}) {
  const [photos, setPhotos] = useState<SelectedPhoto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const photosRef = useRef<SelectedPhoto[]>([]);

  useEffect(() => {
    photosRef.current = photos;
    if (!photoInputRef.current) return;
    try {
      const transfer = new DataTransfer();
      for (const photo of photos) transfer.items.add(photo.file);
      photoInputRef.current.files = transfer.files;
    } catch {
      // Older mobile browsers retain the picker files without DataTransfer.
    }
  }, [photos]);

  useEffect(() => () => {
    for (const photo of photosRef.current) URL.revokeObjectURL(photo.previewUrl);
  }, []);

  async function handlePhotoChange(event: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const selectedFiles = Array.from(event.target.files ?? []);
    if (!selectedFiles.length) return;
    if (photos.length + selectedFiles.length > 12) {
      setError("You can upload a maximum of 12 QC photos.");
      event.target.value = "";
      return;
    }

    const additions: SelectedPhoto[] = [];
    for (const rawFile of selectedFiles) {
      if (rawFile.size > MAX_FILE_SIZE) {
        setError(`"${rawFile.name}" exceeds the 25 MB limit.`);
        event.target.value = "";
        return;
      }
      if (!["image/jpeg", "image/png", "image/webp"].includes(rawFile.type)) {
        setError(`"${rawFile.name}" must be a JPEG, PNG, or WebP image.`);
        event.target.value = "";
        return;
      }
      const file = await compressImage(rawFile);
      additions.push({
        id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
        file,
        previewUrl: URL.createObjectURL(file),
      });
    }
    setPhotos((current) => [...current, ...additions]);
    event.target.value = "";
  }

  function removePhoto(id: string) {
    setPhotos((current) => {
      const removed = current.find((photo) => photo.id === id);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return current.filter((photo) => photo.id !== id);
    });
  }

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="replacement_id" value={replacementId} />
      <input
        ref={photoInputRef}
        type="file"
        name="qc_photos"
        multiple
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />
      <div className="rounded-xl bg-indigo-50 p-4">
        <p className="font-bold text-indigo-950">Request QC approval from Esha</p>
        <p className="mt-1 text-sm text-indigo-800">
          Add clear photos of the correct product and its condition. Esha will approve or return the order.
        </p>
      </div>
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-900">
          <AlertCircle className="size-5 shrink-0 text-rose-600" />
          <span>{error}</span>
        </div>
      )}
      <label className="relative flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-indigo-300 bg-indigo-50/70 p-4 text-center transition hover:border-indigo-500 hover:bg-indigo-50">
        <Camera className="size-8 text-indigo-600" />
        <span className="mt-2 text-base font-black text-indigo-950">
          {photos.length ? "ADD MORE QC PHOTOS" : "TAKE / UPLOAD QC PHOTOS"}
        </span>
        <span className="mt-1 text-xs text-indigo-700">Camera or gallery; 1-12 photos, optimized before upload</span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          multiple
          onChange={handlePhotoChange}
          className="absolute inset-0 cursor-pointer opacity-0"
          aria-label="Upload Packing QC photos"
        />
      </label>
      {photos.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((photo, index) => (
            <div key={photo.id} className="relative aspect-square overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
              <Image src={photo.previewUrl} alt={`QC preview ${index + 1}`} fill unoptimized className="object-cover" />
              <button
                type="button"
                onClick={() => removePhoto(photo.id)}
                aria-label={`Remove QC photo ${index + 1}`}
                className="absolute right-2 top-2 grid size-8 place-items-center rounded-lg bg-rose-600/90 text-white shadow hover:bg-rose-700"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}
      <SubmitButton disabled={photos.length === 0} pendingText="Sending to Esha…">
        <Send className="size-5" />
        REQUEST ESHA APPROVAL {photos.length ? `(${photos.length} PHOTO${photos.length === 1 ? "" : "S"})` : ""}
      </SubmitButton>
    </form>
  );
}
