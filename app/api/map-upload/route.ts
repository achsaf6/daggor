import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../../lib/supabaseServer";

export const runtime = "nodejs";

const DEFAULT_BUCKET = process.env.SUPABASE_MAPS_BUCKET || "maps";
const DEFAULT_MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_UPLOAD_BYTES = Number(process.env.MAP_UPLOAD_MAX_BYTES) || DEFAULT_MAX_UPLOAD_BYTES;
const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
]);

const sanitizeSegment = (value: string) => value.replace(/[^a-zA-Z0-9-_]/g, "");

export async function POST(request: NextRequest) {
  if (!DEFAULT_BUCKET) {
    return NextResponse.json({ error: "Supabase storage bucket not configured." }, { status: 500 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const battlemapId = formData.get("battlemapId");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `File exceeds maximum size of ${Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024))}MB.` },
      { status: 413 }
    );
  }

  if (file.type && !ALLOWED_MIME_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Unsupported file type." }, { status: 400 });
  }

  const sanitizedBattlemapId =
    typeof battlemapId === "string" && battlemapId ? sanitizeSegment(battlemapId) : "unassigned";

  const extension =
    (typeof file.name === "string" && file.name.includes(".")
      ? file.name.split(".").pop()?.toLowerCase()
      : undefined) || "png";

  const uniqueSuffix = randomUUID();
  const objectPath = `battlemaps/${sanitizedBattlemapId}/${uniqueSuffix}.${extension}`;

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const supabase = getSupabaseServerClient();

  const uploadResult = await supabase.storage.from(DEFAULT_BUCKET).upload(objectPath, buffer, {
    contentType: file.type || `image/${extension}`,
    upsert: false,
  });

  if (uploadResult.error) {
    console.error("Supabase upload error:", uploadResult.error);
    return NextResponse.json({ error: "Failed to store file." }, { status: 500 });
  }

  const { data: publicUrlData } = supabase.storage.from(DEFAULT_BUCKET).getPublicUrl(objectPath);

  return NextResponse.json({
    bucket: DEFAULT_BUCKET,
    path: objectPath,
    publicUrl: publicUrlData.publicUrl,
  });
}


