import { readFileFromDisk } from "@/lib/storage";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ bucket: string; path: string[] }> },
) {
  const { bucket, path } = await params;
  if (!bucket || !path || path.length === 0) {
    return new NextResponse("Invalid file path", { status: 400 });
  }

  const filePath = path.join("/");
  const file = readFileFromDisk(bucket, filePath);

  if (!file) {
    return new NextResponse("File not found", { status: 404 });
  }

  return new NextResponse(new Uint8Array(file.buffer), {
    status: 200,
    headers: {
      "Content-Type": file.contentType,
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    },
  });
}

