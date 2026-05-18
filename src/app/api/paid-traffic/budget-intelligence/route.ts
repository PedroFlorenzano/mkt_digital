import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@server/lib/auth";
import { budgetIntelligenceService } from "@server/services/budget-intelligence.service";
import { companyService } from "@server/services/company.service";
import { withErrorHandler } from "@server/lib/api-handler";
import { UnauthorizedError } from "@server/lib/errors";

export const GET = withErrorHandler(async (_request: Request) => {
  // 1. Authenticate
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new UnauthorizedError();

  const userId = session.user.id;
  const activeCompanyId = session.user.activeCompanyId;
  if (!activeCompanyId) throw new UnauthorizedError("Nenhuma empresa selecionada");

  // 3. Verify ownership and resolve company
  const company = await companyService.assertOwnership(userId, activeCompanyId);

  // 4. Get budget recommendations
  const recommendations = await budgetIntelligenceService.getRecommendations(company.id);

  return NextResponse.json(recommendations, { status: 200 });
});

