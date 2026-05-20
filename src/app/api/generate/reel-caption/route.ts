import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@server/lib/auth";
import { prisma } from "@server/lib/prisma";
import { generateTextWithBedrock } from "@server/lib/bedrock";
import { parseColors } from "@server/services/variation.service";
import { AppError } from "@server/lib/errors";

const VALID_VIDEO_PLATFORMS = ["instagram", "tiktok", "youtube"] as const;
type VideoPlatform = (typeof VALID_VIDEO_PLATFORMS)[number];

const platformLabel: Record<VideoPlatform, string> = {
  instagram: "Instagram Reels",
  tiktok: "TikTok",
  youtube: "YouTube Shorts",
};

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const activeCompanyId = session.user.activeCompanyId;
  if (!activeCompanyId) {
    return NextResponse.json({ error: "Nenhuma empresa selecionada" }, { status: 401 });
  }

  let body: { idea?: unknown; platform?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const platform = typeof body.platform === "string" ? body.platform : "";
  const idea = typeof body.idea === "string" ? body.idea.trim() : "";

  if (!VALID_VIDEO_PLATFORMS.includes(platform as VideoPlatform)) {
    return NextResponse.json(
      {
        error: `Plataforma inválida: "${platform}". Valores aceitos: ${VALID_VIDEO_PLATFORMS.join(", ")}`,
      },
      { status: 400 },
    );
  }

  const validPlatform = platform as VideoPlatform;
  const label = platformLabel[validPlatform];
  const isYoutube = validPlatform === "youtube";
  const captionMaxChars = isYoutube ? 500 : 2200;

  try {
    const company = await prisma.company.findFirst({
      where: { id: activeCompanyId, userId: session.user.id },
      select: { id: true, sector: true, tone: true, objective: true, colors: true },
    });

    if (!company) {
      return NextResponse.json({ error: "Empresa não encontrada" }, { status: 404 });
    }

    const colors = parseColors(company.colors);
    const brandContext = [
      colors.length > 0 ? `Paleta de cores: ${colors.join(", ")}.` : null,
      `Tom de comunicação: ${company.tone}.`,
      company.sector ? `Setor: ${company.sector}.` : null,
      company.objective ? `Objetivo de negócio: ${company.objective}.` : null,
    ]
      .filter(Boolean)
      .join(" ");

    const systemPrompt = `Você é um especialista em marketing para ${label}.

Contexto da marca: ${brandContext}

Gere uma legenda envolvente para um vídeo de ${label} com as seguintes regras:
- A legenda deve ter no máximo ${captionMaxChars} caracteres
- Inclua emojis estrategicamente
- Finalize com uma chamada para ação (CTA) clara
- Gere entre 5 e 30 hashtags relevantes ao nicho/setor da marca

Retorne APENAS JSON válido neste formato:
{
  "caption": "texto completo da legenda com emojis e CTA",
  "hashtags": ["#hashtag1", "#hashtag2", "#hashtag3"]
}`;

    const userMessage = idea
      ? `Crie a legenda para um vídeo de ${label} sobre: ${idea}`
      : `Crie uma legenda relevante para um vídeo de ${label} desta marca`;

    // Apply 30-second timeout to the AI call
    const timeoutMs = 30_000;
    let result: Awaited<ReturnType<typeof generateTextWithBedrock>>;
    try {
      result = await Promise.race([
        generateTextWithBedrock(company.id, systemPrompt, userMessage),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("Tempo limite de 30 segundos excedido")),
            timeoutMs,
          ),
        ),
      ]);
    } catch (timeoutOrAiErr) {
      const message =
        timeoutOrAiErr instanceof Error
          ? timeoutOrAiErr.message
          : "Falha ao gerar legenda";
      return NextResponse.json(
        { error: `Falha na geração de legenda: ${message}` },
        { status: 502 },
      );
    }

    // The bedrock lib wraps the raw text in options[0].content when the JSON
    // doesn't have an "options" key. Extract the JSON from the raw text.
    const rawText = result.options[0]?.content ?? "";
    let caption: string;
    let hashtags: string[];

    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : rawText) as {
        caption?: string;
        hashtags?: string[];
      };

      if (typeof parsed.caption !== "string" || !Array.isArray(parsed.hashtags)) {
        throw new Error("Formato de resposta inesperado");
      }

      caption = parsed.caption;
      hashtags = parsed.hashtags.filter((h): h is string => typeof h === "string");
    } catch {
      return NextResponse.json(
        { error: "Erro ao interpretar resposta da IA" },
        { status: 502 },
      );
    }

    // Validate response shape per Requirement 9.6
    if (!caption || caption.trim().length === 0) {
      return NextResponse.json(
        { error: "A IA retornou uma legenda vazia" },
        { status: 502 },
      );
    }

    // Normalise hashtags: keep only strings starting with "#", clamp to 30
    const validHashtags = hashtags
      .filter((h) => h.startsWith("#"))
      .slice(0, 30);

    if (validHashtags.length === 0) {
      return NextResponse.json(
        { error: "A IA não retornou hashtags válidas (cada uma deve começar com #)" },
        { status: 502 },
      );
    }

    return NextResponse.json({ caption, hashtags: validHashtags, usage: result.usage });
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }

    console.error("[generate/reel-caption] Error:", err);
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 },
    );
  }
}
