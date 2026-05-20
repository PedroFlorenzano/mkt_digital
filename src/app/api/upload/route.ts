import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@server/lib/auth";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";

const UPLOAD_DIR = join(process.cwd(), "public", "uploads");
const MAX_IMAGE_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_VIDEO_FILE_SIZE = 500 * 1024 * 1024; // 500MB
const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/mov", "video/quicktime", "video/webm"];

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const formData = await request.formData();
  const files = formData.getAll("files") as File[];

  if (!files || files.length === 0) {
    return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });
  }

  if (files.length > 5) {
    return NextResponse.json({ error: "Máximo 5 imagens por vez" }, { status: 400 });
  }

  await mkdir(UPLOAD_DIR, { recursive: true });

  const uploaded: { url: string; name: string }[] = [];

  for (const file of files) {
    const isImage = ALLOWED_IMAGE_TYPES.includes(file.type);
    const isVideo = ALLOWED_VIDEO_TYPES.includes(file.type);

    if (!isImage && !isVideo) {
      return NextResponse.json(
        {
          error: `Tipo não suportado: ${file.type}. Tipos aceitos: imagens (PNG, JPG, WebP, GIF) ou vídeos (MP4, MOV, WebM).`,
        },
        { status: 400 }
      );
    }

    const maxSize = isVideo ? MAX_VIDEO_FILE_SIZE : MAX_IMAGE_FILE_SIZE;
    const maxSizeLabel = isVideo ? "500MB" : "10MB";

    if (file.size > maxSize) {
      return NextResponse.json(
        { error: `Arquivo ${file.name} excede ${maxSizeLabel}` },
        { status: 400 }
      );
    }

    const ext = file.name.split(".").pop() || "png";
    const filename = `${randomUUID()}.${ext}`;
    const filepath = join(UPLOAD_DIR, filename);

    const bytes = await file.arrayBuffer();
    await writeFile(filepath, Buffer.from(bytes));

    uploaded.push({
      url: `/uploads/${filename}`,
      name: file.name,
    });
  }

  return NextResponse.json({ files: uploaded });
}
