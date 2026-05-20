import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@server/lib/auth";
import { prisma } from "@server/lib/prisma";
import {
  generateStoryImage,
  validateStoryScheduling,
} from "@server/services/story.service";
import {
  buildBrandPrompt,
  parseColors,
  type BrandContext,
} from "@server/services/variation.service";
import { ValidationError, ExternalServiceError } from "@server/lib/errors";

export async function POST(request: Request) {
  // 1. Auth check
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const companyId = session.user.activeCompanyId;
  if (!companyId) {
    return NextResponse.json(
      { error: "Nenhuma empresa selecionada" },
      { status: 401 },
    );
  }

  // Parse request body
  let body: { idea?: unknown; scheduledAt?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const idea =
    typeof body.idea === "string" ? body.idea.trim() : "";
  const scheduledAt =
    typeof body.scheduledAt === "string" ? body.scheduledAt : undefined;

  if (!idea) {
    return NextResponse.json(
      { error: "O campo 'idea' é obrigatório" },
      { status: 400 },
    );
  }

  try {
    // 2. Load company from Prisma
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: {
        sector: true,
        tone: true,
        objective: true,
        colors: true,
      },
    });

    if (!company) {
      return NextResponse.json(
        { error: "Empresa não encontrada" },
        { status: 404 },
      );
    }

    // 3. Parse colors, build BrandContext and brandPrompt
    const colors = parseColors(company.colors);

    const brandContext: BrandContext = {
      colors,
      tone: company.tone ?? "",
      sector: company.sector ?? "",
      objective: company.objective ?? undefined,
    };

    const brandPrompt = buildBrandPrompt(idea, brandContext);

    // 4. Validate scheduling constraint
    validateStoryScheduling(scheduledAt ? new Date(scheduledAt) : null);

    // 5. Generate Story image
    const base64Image = await generateStoryImage(
      companyId,
      brandPrompt,
      company.objective ?? "",
    );

    // 6. Return the image URL — frontend handles saving to Post
    return NextResponse.json({ imageUrl: base64Image });
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }

    if (err instanceof ExternalServiceError) {
      return NextResponse.json({ error: err.message }, { status: 502 });
    }

    console.error(
      "[generate/story] unexpected error:",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 },
    );
  }
}
