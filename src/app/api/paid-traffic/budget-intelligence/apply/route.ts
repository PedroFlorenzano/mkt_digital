import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@server/lib/auth";
import {
  budgetIntelligenceService,
  ApplyBudgetInput,
} from "@server/services/budget-intelligence.service";
import { companyService } from "@server/services/company.service";
import { withErrorHandler } from "@server/lib/api-handler";
import { UnauthorizedError } from "@server/lib/errors";

export const POST = withErrorHandler(async (request: Request) => {
  // 1. Authenticate
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new UnauthorizedError();

  const userId = session.user.id;
  const activeCompanyId = session.user.activeCompanyId;
  if (!activeCompanyId) throw new UnauthorizedError("Nenhuma empresa selecionada");

  // 3. Parse and validate body
  const body = await request.json() as Record<string, unknown>;
  const { allocations } = body;

  if (!allocations || !Array.isArray(allocations)) {
    return NextResponse.json(
      { error: "O campo 'allocations' é obrigatório e deve ser um array." },
      { status: 400 },
    );
  }

  // 4. Verify ownership and resolve company
  const company = await companyService.assertOwnership(userId, activeCompanyId);

  // 5. Apply budget allocations
  const input: ApplyBudgetInput = {
    companyId: company.id,
    allocations: allocations as Array<{
      campaignId: string;
      newDailyBudgetBrl: number;
    }>,
  };

  const result = await budgetIntelligenceService.apply(input, userId);

  return NextResponse.json(result, { status: 200 });
});

