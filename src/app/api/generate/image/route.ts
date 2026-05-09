import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateImageWithBedrock } from "@/lib/bedrock";

const platformAspectRatio: Record<string, string> = {
  instagram: "1:1",
  facebook: "16:9",
  linkedin: "16:9",
  whatsapp: "1:1",
};

const SUPPORTED_PLATFORMS = Object.keys(platformAspectRatio);

function sanitizeColors(raw: unknown): string[] {
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter((c): c is string => typeof c === "string").slice(0, 5);
    } catch { /* continue */ }
  }
  if (!Array.isArray(raw)) return ["#3B82F6", "#1E40AF"];
  const cleaned = raw.filter((c): c is string => typeof c === "string" && c.length > 0);
  return cleaned.length > 0 ? cleaned.slice(0, 5) : ["#3B82F6", "#1E40AF"];
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

  let body: { platform?: unknown; idea?: unknown; style?: unknown; referenceContext?: unknown; trendingContext?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const platform = typeof body.platform === "string" ? body.platform : "";
  const idea = typeof body.idea === "string" ? body.idea.trim() : "";
  const style = typeof body.style === "string" ? body.style.trim() : "";
  const referenceContext = typeof body.referenceContext === "string" ? body.referenceContext.trim() : "";
  const trendingContext = typeof body.trendingContext === "string" ? body.trendingContext.trim() : "";

  if (!platform) {
    return NextResponse.json({ error: "Plataforma é obrigatória" }, { status: 400 });
  }
  if (!SUPPORTED_PLATFORMS.includes(platform)) {
    return NextResponse.json(
      { error: `Plataforma não suportada. Use: ${SUPPORTED_PLATFORMS.join(", ")}` },
      { status: 400 },
    );
  }

  const colors = sanitizeColors(company.colors);

  const prompt = [
    `Professional social media post image for ${company.name}, a ${company.sector || "business"} company.`,
    idea || company.description || "",
    `Brand color palette: ${colors.join(", ")}.`,
    `Target: ${platform} post.`,
    style ? `Style: ${style}.` : "Style: modern, clean, professional.",
    referenceContext ? `Visual reference context: ${referenceContext}.` : "",
    trendingContext ? `Current trending topic to incorporate: ${trendingContext}.` : "",
    "High quality, no text overlay, no watermark.",
  ]
    .filter(Boolean)
    .join(" ");

  try {
    const result = await generateImageWithBedrock(company.id, prompt, 3);

    if (result.images.length === 0) {
      return NextResponse.json(
        { error: "Nenhuma imagem foi gerada" },
        { status: 502 },
      );
    }

    return NextResponse.json({
      images: result.images,
      usage: result.usage,
    });
  } catch (err) {
    console.error("[generate/image] Bedrock error:", err);
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json(
      { error: `Erro ao gerar imagens: ${message}` },
      { status: 502 },
    );
  }
}
