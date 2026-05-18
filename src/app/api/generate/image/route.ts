import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@server/lib/auth";
import { companyService } from "@server/services/company.service";
import { generateImageWithBedrock } from "@server/lib/bedrock";
import { composeMarketingPost, applyLayoutTemplate, bufferToDataUrl } from "@server/lib/image-compose";
import { translateToImagePrompt, buildFallbackPrompt } from "@server/services/promptTranslator";

const SUPPORTED_PLATFORMS = ["instagram", "facebook", "linkedin", "whatsapp"];

function sanitizeColors(raw: unknown): string[] {
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter((c): c is string => typeof c === "string").slice(0, 5);
    } catch { /* continue */ }
  }
  if (!Array.isArray(raw)) return ["#1a1a2e", "#3B82F6"];
  const cleaned = raw.filter((c): c is string => typeof c === "string" && c.length > 0);
  return cleaned.length > 0 ? cleaned.slice(0, 5) : ["#1a1a2e", "#3B82F6"];
}

function dataUrlToBuffer(dataUrl: string): Buffer {
  const comma = dataUrl.indexOf(",");
  return Buffer.from(dataUrl.slice(comma + 1), "base64");
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const userId = session.user.id;
  const activeCompanyId = session.user.activeCompanyId;
  if (!activeCompanyId) {
    return NextResponse.json({ error: "Nenhuma empresa selecionada" }, { status: 401 });
  }

  let company;
  try {
    company = await companyService.assertOwnership(userId, activeCompanyId);
  } catch {
    return NextResponse.json({ error: "Empresa não configurada" }, { status: 400 });
  }

  let body: {
    platform?: unknown;
    idea?: unknown;
    style?: unknown;
    referenceContext?: unknown;
    trendingContext?: unknown;
    addTextOverlay?: unknown;
    overlayHeadline?: unknown;
    overlayBody?: unknown;
    layoutTemplate?: unknown;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const platform = typeof body.platform === "string" ? body.platform : "";
  const idea = typeof body.idea === "string" ? body.idea.trim().slice(0, 2000) : "";
  const style = typeof body.style === "string" ? body.style.trim().slice(0, 200) : "";
  const trendingContext = typeof body.trendingContext === "string" ? body.trendingContext.trim().slice(0, 1000) : "";

  const addTextOverlay = body.addTextOverlay === true;
  const overlayHeadline = typeof body.overlayHeadline === "string" ? body.overlayHeadline.trim().slice(0, 200) : "";
  const overlayBody = typeof body.overlayBody === "string" ? body.overlayBody.trim().slice(0, 300) : "";
  const layoutTemplate = typeof body.layoutTemplate === "string" ? body.layoutTemplate : "gradient-bottom";

  if (!platform || !SUPPORTED_PLATFORMS.includes(platform)) {
    return NextResponse.json(
      { error: `Plataforma inválida. Use: ${SUPPORTED_PLATFORMS.join(", ")}` },
      { status: 400 },
    );
  }

  const colors = sanitizeColors(company.colors);

  // Usa Claude para traduzir a ideia do usuário em um prompt técnico em inglês
  const ideaForTranslation = [idea, trendingContext].filter(Boolean).join(". ");
  const companyCtx = {
    name: company.name,
    sector: company.sector,
    description: company.description,
    objective: company.objective,
    tone: company.tone,
    colors,
  };

  let imagePrompt: string;
  if (ideaForTranslation) {
    const translated = await translateToImagePrompt(ideaForTranslation, companyCtx);
    imagePrompt = translated ?? buildFallbackPrompt(ideaForTranslation, companyCtx);
  } else {
    imagePrompt = buildFallbackPrompt(
      company.description || `${company.sector || "business"} professional scene`,
      companyCtx,
    );
  }

  // Adiciona estilo visual se fornecido
  if (style) {
    imagePrompt = `${imagePrompt} Visual style: ${style}.`;
  }

  try {
    const result = await generateImageWithBedrock(company.id, imagePrompt, 3);

    if (result.images.length === 0) {
      return NextResponse.json({ error: "Nenhuma imagem foi gerada" }, { status: 502 });
    }

    let finalImages = result.images;

    if (addTextOverlay && (overlayHeadline || overlayBody)) {
      finalImages = await Promise.all(
        result.images.map(async (dataUrl) => {
          try {
            const buf = dataUrlToBuffer(dataUrl);
            let composed: Buffer;

            if (layoutTemplate === "text-left" || layoutTemplate === "split-dark") {
              composed = await applyLayoutTemplate(buf, {
                template: layoutTemplate as "text-left" | "split-dark",
                headline: overlayHeadline || undefined,
                body: overlayBody || undefined,
                companyName: company.name,
                brandColors: colors,
              });
            } else {
              // Layout padrão: gradiente no rodapé com texto integrado
              composed = await composeMarketingPost(buf, {
                headline: overlayHeadline || "",
                body: overlayBody || undefined,
                companyName: company.name,
                brandColors: colors,
              });
            }

            return bufferToDataUrl(composed, "image/webp");
          } catch (err) {
            console.error("[generate/image] overlay failed:", err instanceof Error ? err.message : err);
            return dataUrl;
          }
        })
      );
    }

    return NextResponse.json({ images: finalImages, usage: result.usage });
  } catch (err) {
    console.error("[generate/image] error:", err instanceof Error ? err.message : err);
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ error: `Erro ao gerar imagens: ${message}` }, { status: 502 });
  }
}
