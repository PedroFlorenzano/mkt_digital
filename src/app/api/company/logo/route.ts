import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizeLogoForStorage } from "@/lib/image-compose";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIMES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const userId = (session.user as { id: string }).id;
  const company = await prisma.company.findUnique({ where: { userId } });
  if (!company) {
    return NextResponse.json({ error: "Empresa não configurada" }, { status: 400 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Upload inválido (esperado multipart/form-data)" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Campo 'file' ausente ou inválido" }, { status: 400 });
  }

  if (!ALLOWED_MIMES.includes(file.type)) {
    return NextResponse.json(
      { error: `Tipo não suportado (${file.type}). Use PNG, JPEG, WebP ou SVG` },
      { status: 400 },
    );
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `Arquivo muito grande: ${(file.size / 1024 / 1024).toFixed(1)} MB (máx 5 MB)` },
      { status: 413 },
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());

  // Para SVG, o sharp precisa dos bytes e renderiza em raster. Normalizamos tudo para PNG data URL.
  let dataUrl: string;
  try {
    dataUrl = await normalizeLogoForStorage(buf);
  } catch (err) {
    console.error("[company/logo] sharp falhou:", err);
    const msg = err instanceof Error ? err.message : "Erro ao processar imagem";
    return NextResponse.json({ error: `Erro ao processar logo: ${msg}` }, { status: 400 });
  }

  const updated = await prisma.company.update({
    where: { id: company.id },
    data: { logoUrl: dataUrl },
    select: { id: true, logoUrl: true },
  });

  return NextResponse.json({ id: updated.id, logoUrl: updated.logoUrl });
}

export async function DELETE() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const userId = (session.user as { id: string }).id;
  const company = await prisma.company.findUnique({ where: { userId } });
  if (!company) {
    return NextResponse.json({ error: "Empresa não configurada" }, { status: 400 });
  }

  await prisma.company.update({
    where: { id: company.id },
    data: { logoUrl: null },
  });

  return NextResponse.json({ ok: true });
}
