import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, normalize, resolve } from "node:path";

export function getUploadDir(): string {
  const dir = process.env.UPLOAD_DIR || join(process.cwd(), "uploads");
  if (!existsSync(/*turbopackIgnore: true*/ dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function getFilePath(bucket: string, path: string): string {
  const baseDir = getUploadDir();
  // Protect against path traversal attacks (e.g. "../../etc/passwd")
  const safePath = normalize(path).replace(/^(\.\.[\/\\])+/, "");
  return resolve(baseDir, bucket, safePath);
}

export async function uploadFile(
  bucket: string,
  path: string,
  fileData: Buffer | Uint8Array | ArrayBuffer,
): Promise<{ error: Error | null }> {
  try {
    const fullPath = getFilePath(bucket, path);
    const parentDir = dirname(fullPath);
    if (!existsSync(parentDir)) {
      mkdirSync(parentDir, { recursive: true });
    }
    const buffer = Buffer.isBuffer(fileData)
      ? fileData
      : Buffer.from(fileData as ArrayBuffer);
    writeFileSync(fullPath, buffer);
    return { error: null };
  } catch (err) {
    return { error: err as Error };
  }
}

export async function removeFiles(
  bucket: string,
  paths: string[],
): Promise<{ error: Error | null }> {
  try {
    for (const p of paths) {
      const fullPath = getFilePath(bucket, p);
      if (existsSync(/*turbopackIgnore: true*/ fullPath)) {
        unlinkSync(fullPath);
      }
    }
    return { error: null };
  } catch (err) {
    return { error: err as Error };
  }
}

export function getFileUrl(bucket: string, path: string): string {
  const cleanPath = path.startsWith("/") ? path.slice(1) : path;
  return `/api/files/${bucket}/${cleanPath}`;
}

export async function createSignedUrl(
  bucket: string,
  path: string,
): Promise<{ data: { signedUrl: string } | null; error: Error | null }> {
  return {
    data: { signedUrl: getFileUrl(bucket, path) },
    error: null,
  };
}

export async function createSignedUrls(
  bucket: string,
  paths: string[],
): Promise<{
  data: Array<{ path: string; signedUrl: string; error: null }> | null;
  error: Error | null;
}> {
  return {
    data: paths.map((path) => ({
      path,
      signedUrl: getFileUrl(bucket, path),
      error: null,
    })),
    error: null,
  };
}

export function readFileFromDisk(
  bucket: string,
  path: string,
): { buffer: Buffer; contentType: string } | null {
  const fullPath = getFilePath(bucket, path);
  if (!existsSync(/*turbopackIgnore: true*/ fullPath)) {
    return null;
  }
  const buffer = readFileSync(/*turbopackIgnore: true*/ fullPath);
  const lower = path.toLowerCase();
  let contentType = "application/octet-stream";
  if (lower.endsWith(".png")) contentType = "image/png";
  else if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) contentType = "image/jpeg";
  else if (lower.endsWith(".webp")) contentType = "image/webp";
  else if (lower.endsWith(".pdf")) contentType = "application/pdf";
  else if (lower.endsWith(".svg")) contentType = "image/svg+xml";

  return { buffer, contentType };
}

