"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Camera, FileText, Trash2, UploadCloud } from "lucide-react";
import { compressImage } from "@/lib/image-compression";
import { MAX_FILE_SIZE } from "@/lib/replacements/validation";

interface SelectedFileItem {
  id: string;
  file: File;
  previewUrl: string | null;
  isImage: boolean;
  originalSize: number;
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function OfflinePhotoPicker({
  name = "dispatch_documents",
  maxFiles = 20,
}: {
  name?: string;
  maxFiles?: number;
}) {
  const [items, setItems] = useState<SelectedFileItem[]>([]);
  const [isCompressing, setIsCompressing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const itemsRef = useRef<SelectedFileItem[]>([]);

  useEffect(() => {
    itemsRef.current = items;
    if (!inputRef.current) return;
    try {
      const transfer = new DataTransfer();
      for (const item of items) {
        transfer.items.add(item.file);
      }
      inputRef.current.files = transfer.files;
    } catch {
      // Mobile Safari fallback
    }
  }, [items]);

  useEffect(() => {
    return () => {
      for (const item of itemsRef.current) {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      }
    };
  }, []);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const selectedFiles = Array.from(event.target.files ?? []);
    if (!selectedFiles.length) return;

    if (items.length + selectedFiles.length > maxFiles) {
      setError(`You can select a maximum of ${maxFiles} photos and documents.`);
      event.target.value = "";
      return;
    }

    setIsCompressing(true);
    try {
      const additions: SelectedFileItem[] = [];

      for (const rawFile of selectedFiles) {
        if (rawFile.size > MAX_FILE_SIZE) {
          setError(`"${rawFile.name}" exceeds 25 MB limit.`);
          continue;
        }

        const isImage = rawFile.type.startsWith("image/") && rawFile.type !== "image/svg+xml";
        const isPdf = rawFile.type === "application/pdf";

        if (!isImage && !isPdf) {
          setError(`"${rawFile.name}" is not a supported image or PDF.`);
          continue;
        }

        let processedFile = rawFile;
        if (isImage) {
          processedFile = await compressImage(rawFile, { maxDimension: 1920, quality: 0.82 });
        }

        additions.push({
          id: `${processedFile.name}-${Date.now()}-${Math.random()}`,
          file: processedFile,
          previewUrl: isImage ? URL.createObjectURL(processedFile) : null,
          isImage,
          originalSize: rawFile.size,
        });
      }

      setItems((current) => [...current, ...additions]);
    } finally {
      setIsCompressing(false);
      event.target.value = "";
    }
  }

  function removeItem(id: string) {
    setItems((current) => {
      const removed = current.find((item) => item.id === id);
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return current.filter((item) => item.id !== id);
    });
  }

  const totalBytes = items.reduce((acc, item) => acc + item.file.size, 0);

  return (
    <div className="grid gap-3">
      {/* Hidden input synchronized with state */}
      <input
        ref={inputRef}
        type="file"
        name={name}
        multiple
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
      />

      {/* Upload button card */}
      <label className="relative flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-indigo-200 bg-indigo-50/50 p-4 text-center transition hover:border-indigo-400 hover:bg-indigo-50">
        <div className="flex items-center gap-2">
          <Camera className="size-6 text-indigo-600" />
          <UploadCloud className="size-6 text-indigo-400" />
        </div>
        <span className="mt-2 text-sm font-bold text-slate-900">
          {items.length === 0
            ? "Take photo or upload labels / docs"
            : "Add more photos or documents"}
        </span>
        <span className="mt-0.5 text-xs text-slate-500">
          Auto-compresses large photos · JPEG, PNG, WebP, PDF · up to {maxFiles} files
        </span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          multiple
          onChange={handleFileChange}
          className="absolute inset-0 cursor-pointer opacity-0"
          aria-label="Upload dispatch photos and documents"
        />
      </label>

      {isCompressing && (
        <p className="text-center text-xs font-semibold text-indigo-600 animate-pulse">
          Compressing photos for fast upload…
        </p>
      )}

      {error && (
        <p className="rounded-xl bg-rose-50 p-3 text-xs font-medium text-rose-700">
          {error}
        </p>
      )}

      {/* Selected items summary */}
      {items.length > 0 && (
        <div className="flex items-center justify-between px-1 text-xs text-slate-500">
          <span className="font-bold text-slate-700">
            {items.length} item{items.length === 1 ? "" : "s"} selected
          </span>
          <span>Total size: {formatSize(totalBytes)}</span>
        </div>
      )}

      {/* Thumbnails grid */}
      {items.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {items.map((item) => (
            <div
              key={item.id}
              className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white p-2 shadow-xs transition hover:border-slate-300"
            >
              {item.isImage && item.previewUrl ? (
                <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-slate-100">
                  <Image
                    src={item.previewUrl}
                    alt={item.file.name}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                </div>
              ) : (
                <div className="flex aspect-video w-full items-center justify-center rounded-lg bg-slate-100">
                  <FileText className="size-8 text-indigo-600" />
                </div>
              )}

              <div className="mt-1.5 flex items-center justify-between gap-1">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-slate-800" title={item.file.name}>
                    {item.file.name}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    {formatSize(item.file.size)}
                    {item.originalSize > item.file.size && (
                      <span className="text-emerald-600 ml-1">
                        (-{Math.round((1 - item.file.size / item.originalSize) * 100)}%)
                      </span>
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => removeItem(item.id)}
                  aria-label={`Remove ${item.file.name}`}
                  className="grid size-7 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
