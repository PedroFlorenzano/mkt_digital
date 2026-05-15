import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@server/lib/auth";
import { prisma } from "@server/lib/prisma";
import { requireTrafficAccess } from "@server/lib/plan-guard";
import { campaignService } from "@server/services/campaign.service";
import { withErrorHandler } from "@server/lib/api-handler";
import { UnauthorizedError, ExternalServiceError } from "@server/lib/errors";

export const POST = withErrorHandler(async (request: Request) => {
  // 1. Authenticate
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new UnauthorizedError();

  const userId = (session.user as { id: string }).id;

  // 2. Check plan eligibility
  await requireTrafficAccess(userId);

  // 3. Parse and validate body
  const body = await request.json() as Record<string, unknown>;
  const description = body["description"];

  if (typeof description !== "string" || description.trim() === "") {
    return NextResponse.json(
      { error: "O campo 'description' é obrigatório e não pode ser vazio." },
      { status: 400 },
    );
  }

  // 4. Fetch company for the authenticated user
  const company = await prisma.company.findUnique({ where: { userId } });

  if (!company) {
    return NextResponse.json(
      { error: "Empresa não encontrada para o usuário autenticado." },
      { status: 404 },
    );
  }

  // 5. Generate campaign draft via AI
  try {
    const draft = await campaignService.generate(company.id, description.trim());
    return NextResponse.json(draft, { status: 200 });
  } catch (err) {
    if (err instanceof ExternalServiceError) {
      return NextResponse.json(
        {
          error:
            "Não foi possível gerar a campanha no momento. O serviço de IA está temporariamente indisponível. Tente novamente em alguns instantes.",
        },
        { status: 502 },
      );
    }
    throw err;
  }
});
