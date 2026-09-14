"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { AlertCircle, Camera, Trash2 } from "lucide-react";
import { compressImage } from "@/lib/image-compression";
import { MAX_FILE_SIZE } from "@/lib/replacements/validation";

interface SelectedPhoto {
  id: string;
  file: File;
  previewUrl: string;
}

/** Lets customer_support capture and preview the product evidence submitted with a new order. */
export function ProductPhotoPicker({ name = "product_photos" }: { name?: string }) {
  const [photos, setPhotos] = useState<SelectedPhoto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const photosRef = useRef<SelectedPhoto[]>([]);

  useEffect(() => {
    photosRef.current = photos;
    if (!inputRef.current) return;
    try {
      const transfer = new DataTransfer();
      for (const photo of photos) transfer.items.add(photo.file);
      inputRef.current.files = transfer.files;
    } catch {
      // Older mobile browsers retain the picker files without DataTransfer.
    }
  }, [photos]);

  useEffect(() => () => {
    for (const photo of photosRef.current) URL.revokeObjectURL(photo.previewUrl);
  }, []);

  async function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const selectedFiles = Array.from(event.target.files ?? []);
    if (!selectedFiles.length) return;
    if (photos.length + selectedFiles.length > 12) {
      setError("You can upload a maximum of 12 product photos.");
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
    <div className="grid gap-3 sm:col-span-2">
      <input
        ref={inputRef}
        type="file"
        name={name}
        multiple
        required
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />

      <label className="relative flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-indigo-300 bg-indigo-50/70 p-4 text-center transition hover:border-indigo-500 hover:bg-indigo-50">
        <Camera className="size-8 text-indigo-600" />
        <span className="mt-2 text-base font-black text-indigo-950">
          {photos.length ? "ADD MORE PRODUCT PHOTOS" : "TAKE / UPLOAD PRODUCT PHOTOS"}
        </span>
        <span className="mt-1 text-xs text-indigo-700">Required; camera or gallery; 1-12 photos</span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={handleChange}
          className="absolute inset-0 cursor-pointer opacity-0"
          aria-label="Upload product photos"
        />
      </label>

      {error ? (
        <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-900">
          <AlertCircle className="size-5 shrink-0 text-rose-600" />
          <span>{error}</span>
        </div>
      ) : null}

      {photos.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((photo, index) => (
            <div key={photo.id} className="relative aspect-square overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
              <Image src={photo.previewUrl} alt={`Product preview ${index + 1}`} fill unoptimized className="object-cover" />
              <button
                type="button"
                onClick={() => removePhoto(photo.id)}
                aria-label={`Remove product photo ${index + 1}`}
                className="absolute right-2 top-2 grid size-8 place-items-center rounded-lg bg-rose-600/90 text-white shadow hover:bg-rose-700"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
