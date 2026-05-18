import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@server/lib/auth";
import { campaignService } from "@server/services/campaign.service";
import { companyService } from "@server/services/company.service";
import { withErrorHandler } from "@server/lib/api-handler";
import { UnauthorizedError, ExternalServiceError } from "@server/lib/errors";

export const POST = withErrorHandler(async (request: Request) => {
  // 1. Authenticate
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new UnauthorizedError();

  const userId = session.user.id;
  const activeCompanyId = session.user.activeCompanyId;
  if (!activeCompanyId) throw new UnauthorizedError("Nenhuma empresa selecionada");

  // 3. Parse and validate body
  const body = await request.json() as Record<string, unknown>;
  const description = body["description"];

  if (typeof description !== "string" || description.trim() === "") {
    return NextResponse.json(
      { error: "O campo 'description' é obrigatório e não pode ser vazio." },
      { status: 400 },
    );
  }

  // 4. Verify ownership and resolve company
  const company = await companyService.assertOwnership(userId, activeCompanyId);

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

