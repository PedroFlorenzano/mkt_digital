import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type TextVariantInput = { title: string; content: string };

function isTextVariantInput(value: unknown): value is TextVariantInput {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.title === "string" && typeof v.content === "string";
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseTextVariants(value: unknown): TextVariantInput[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isTextVariantInput).slice(0, 10);
}

function parseImageVariants(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === "string" && v.length > 0)
    .slice(0, 10);
}

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

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const platform = typeof body.platform === "string" ? body.platform : "";
  const content = typeof body.content === "string" ? body.content : null;
  const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl : null;
  const scheduledAt = parseDate(body.scheduledAt);

  if (!platform) {
    return NextResponse.json({ error: "Plataforma é obrigatória" }, { status: 400 });
  }
  if (!content && !imageUrl) {
    return NextResponse.json(
      { error: "Post precisa ter texto ou imagem" },
      { status: 400 },
    );
  }

  const textVariants = parseTextVariants(body.textVariants);
  const imageVariants = parseImageVariants(body.imageVariants);

  const selectedTextIndex =
    typeof body.selectedTextIndex === "number" ? body.selectedTextIndex : null;
  const selectedImageIndex =
    typeof body.selectedImageIndex === "number" ? body.selectedImageIndex : null;

  const variantRecords: Array<{
    type: string;
    content: string | null;
    mediaUrl: string | null;
    selected: boolean;
  }> = [];

  textVariants.forEach((variant, index) => {
    variantRecords.push({
      type: "text",
      content: variant.content,
      mediaUrl: null,
      selected: index === selectedTextIndex,
    });
  });

  imageVariants.forEach((url, index) => {
    variantRecords.push({
      type: "image",
      content: null,
      mediaUrl: url,
      selected: index === selectedImageIndex,
    });
  });

  try {
    const post = await prisma.post.create({
      data: {
        companyId: company.id,
        platform,
        content,
        imageUrl,
        status: scheduledAt ? "scheduled" : "draft",
        scheduledAt,
        ...(variantRecords.length > 0 && {
          variants: { create: variantRecords },
        }),
      },
      include: { variants: true },
    });

    return NextResponse.json(post);
  } catch (err) {
    console.error("[posts] Create failed:", err);
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json(
      { error: `Erro ao salvar post: ${message}` },
      { status: 500 },
    );
  }
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const userId = (session.user as { id: string }).id;
  const company = await prisma.company.findUnique({ where: { userId } });

  if (!company) {
    return NextResponse.json({ error: "Empresa não configurada" }, { status: 400 });
  }

  const posts = await prisma.post.findMany({
    where: { companyId: company.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json(posts);
}
