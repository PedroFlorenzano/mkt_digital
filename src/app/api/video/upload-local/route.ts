/**
 * POST /api/video/upload-local
 *
 * Development fallback: accepts a video file as multipart/form-data and
 * saves it to the local filesystem (public/uploads/videos/).
 * Returns a "local:..." key that s3-video.ts handles transparently.
 *
 * Used automatically when AWS_S3_VIDEO_BUCKET is a placeholder or not set.
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@server/lib/auth";
import { UnauthorizedError } from "@server/lib/errors";
import * as path from "node:path";
import * as fs from "node:fs";
import * as crypto from "node:crypto";

const VIDEO_UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "videos");

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 });
    }

    // Validate size (500 MB)
    if (file.size > 524_288_000) {
      return NextResponse.json({ error: "Arquivo muito grande. Máximo 500 MB." }, { status: 400 });
    }

    ensureDir(VIDEO_UPLOAD_DIR);

    const ext = file.name.split(".").pop() ?? "mp4";
    const fileName = `${crypto.randomUUID()}.${ext}`;
    const filePath = path.join(VIDEO_UPLOAD_DIR, fileName);

    // Write file to disk
    const arrayBuffer = await file.arrayBuffer();
    fs.writeFileSync(filePath, Buffer.from(arrayBuffer));

    // Return a local key that the pipeline can read
    const localKey = `local:uploads/videos/${fileName}`;

    return NextResponse.json({ s3Key: localKey }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
