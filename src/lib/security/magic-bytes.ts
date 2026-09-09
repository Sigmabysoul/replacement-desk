/**
 * Magic byte (file signature) validation for uploaded attachments.
 * Prevents MIME spoofing where malicious files or executables are disguised
 * with a false extension or Content-Type header.
 */

/**
 * Inspects a byte buffer against known magic number signatures for allowed MIME types.
 *
 * Supported formats:
 * - `image/jpeg`: Starts with `FF D8 FF`
 * - `image/png`: Starts with `89 50 4E 47 0D 0A 1A 0A`
 * - `image/webp`: Starts with `RIFF` at [0..3] and `WEBP` at [8..11]
 * - `application/pdf`: Starts with `%PDF` (`25 50 44 46`)
 *
 * @param header Raw binary header buffer (at least 4-12 bytes required depending on type).
 * @param mimeType Expected MIME type claimed in the HTTP request or File object.
 * @returns `true` if the binary signature matches the claimed MIME type; otherwise `false`.
 */
export function validateMagicBytes(header: Uint8Array, mimeType: string): boolean {
  if (header.length < 4) return false;

  switch (mimeType) {
    case "image/jpeg":
      // JPEG starts with FF D8 FF
      return header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;

    case "image/png":
      // PNG starts with 89 50 4E 47 0D 0A 1A 0A
      if (header.length < 8) return false;
      return (
        header[0] === 0x89 &&
        header[1] === 0x50 &&
        header[2] === 0x4e &&
        header[3] === 0x47 &&
        header[4] === 0x0d &&
        header[5] === 0x0a &&
        header[6] === 0x1a &&
        header[7] === 0x0a
      );

    case "image/webp":
      // WebP starts with 'RIFF' (0-3) and contains 'WEBP' (8-11)
      if (header.length < 12) return false;
      const isRiff =
        header[0] === 0x52 && // R
        header[1] === 0x49 && // I
        header[2] === 0x46 && // F
        header[3] === 0x46; // F
      const isWebp =
        header[8] === 0x57 && // W
        header[9] === 0x45 && // E
        header[10] === 0x42 && // B
        header[11] === 0x50; // P
      return isRiff && isWebp;

    case "application/pdf":
      // PDF starts with '%PDF' (0x25 0x50 0x44 0x46)
      return (
        header[0] === 0x25 && // %
        header[1] === 0x50 && // P
        header[2] === 0x44 && // D
        header[3] === 0x46 // F
      );

    default:
      return false;
  }
}

/**
 * Reads the initial 16 bytes of a browser/Node `File` blob and verifies its binary signature.
 *
 * Slices only the first 16 bytes into memory to remain fast and memory-efficient
 * without loading large file payloads into RAM.
 *
 * @param file The browser/Node File object to verify.
 * @returns Resolves to `true` if magic bytes match `file.type`, or `false` on mismatch or read error.
 */
export async function verifyFileSignature(file: File): Promise<boolean> {
  try {
    const slice = file.slice(0, 16);
    const arrayBuffer = await slice.arrayBuffer();
    const header = new Uint8Array(arrayBuffer);
    return validateMagicBytes(header, file.type);
  } catch {
    return false;
  }
}
