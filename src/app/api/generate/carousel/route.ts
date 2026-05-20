import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@server/lib/auth";
import { prisma } from "@server/lib/prisma";
import { generateImageWithBedrock, generateTextWithBedrock } from "@server/lib/bedrock";
import { buildCarousel, Slide } from "@server/services/carousel.service";
import { buildBrandPrompt, parseColors, BrandContext } from "@server/services/variation.service";
import { AppError } from "@server/lib/errors";

export async function POST(request: Request) {
  // 1. Auth check
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const activeCompanyId = session.user.activeCompanyId;
  if (!activeCompanyId) {
    return NextResponse.json({ error: "Nenhuma empresa selecionada" }, { status: 401 });
  }

  // Parse request body
  let body: { idea?: unknown; slideCount?: unknown; style?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const idea = typeof body.idea === "string" ? body.idea.trim() : "";
  const rawSlideCount = typeof body.slideCount === "number" ? body.slideCount : 5;
  const slideCount = Math.min(10, Math.max(3, Math.round(rawSlideCount)));

  if (!idea) {
    return NextResponse.json({ error: "O campo 'idea' é obrigatório" }, { status: 400 });
  }

  try {
    // 2. Load company from Prisma
    const company = await prisma.company.findFirst({
      where: { id: activeCompanyId },
      select: {
        id: true,
        name: true,
        sector: true,
        tone: true,
        objective: true,
        colors: true,
      },
    });

    if (!company) {
      return NextResponse.json({ error: "Empresa não encontrada" }, { status: 404 });
    }

    // 3. Parse colors
    const colors = parseColors(company.colors);

    // 4. Build BrandContext
    const brandContext: BrandContext = {
      colors,
      tone: company.tone ?? "professional",
      sector: company.sector ?? "",
      objective: company.objective ?? undefined,
    };

    // 5. & 6. Generate images and headlines for each slide in parallel
    const brandPrompt = buildBrandPrompt(idea, brandContext);

    // Build system prompt for headline generation
    const systemPrompt =
      `You are a professional marketing copywriter for ${company.name}. ` +
      `Tone: ${brandContext.tone}. Sector: ${brandContext.sector}. ` +
      `Generate concise, compelling slide headlines for a carousel post. ` +
      `Return a JSON object with an "options" array containing a single item: { "title": "Slide", "content": "<headline>" }.`;

    const slideGenerationPromises = Array.from({ length: slideCount }, async (_, index) => {
      const [imageResult, textResult] = await Promise.all([
        generateImageWithBedrock(company.id, brandPrompt, 1, "1:1"),
        generateTextWithBedrock(
          company.id,
          systemPrompt,
          `Generate a slide headline for: ${idea} (slide ${index + 1} of ${slideCount})`,
        ),
      ]);

      // Extract image URL (first generated image, or empty string as fallback)
      const imageUrl = imageResult.images[0] ?? "";

      // Extract headline: first line of content, truncated to 60 chars
      const rawHeadline = textResult.options[0]?.content ?? "";
      const headline = rawHeadline.split("\n")[0]?.slice(0, 60) ?? "";

      const slide: Slide = {
        id: `slide-${index}-${Date.now()}`,
        imageUrl,
        headline,
        order: index,
      };

      return slide;
    });

    // Generate all slides (sequential to avoid AWS throttling)
    const slides: Slide[] = [];
    for (const promise of slideGenerationPromises) {
      slides.push(await promise);
    }

    // 7. Build carousel
    const result = buildCarousel(slides);

    // 8. Create Post record in Prisma
    const post = await prisma.post.create({
      data: {
        companyId: activeCompanyId,
        platform: "instagram",
        status: "draft",
        format: "carousel",
        slidesJson: result.slidesJson,
        content: idea,
      },
    });

    // 9. Return response
    return NextResponse.json({
      postId: post.id,
      slides: result.slides,
      slidesJson: result.slidesJson,
    });
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }

    console.error("[generate/carousel] error:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: "Erro interno ao gerar carrossel" },
      { status: 500 },
    );
  }
}
