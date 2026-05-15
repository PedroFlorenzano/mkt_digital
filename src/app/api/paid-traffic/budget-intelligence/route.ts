import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@server/lib/auth";
import { prisma } from "@server/lib/prisma";
import { requireTrafficAccess } from "@server/lib/plan-guard";
import { budgetIntelligenceService } from "@server/services/budget-intelligence.service";
import { withErrorHandler } from "@server/lib/api-handler";
import { UnauthorizedError } from "@server/lib/errors";

export const GET = withErrorHandler(async (_request: Request) => {
  // 1. Authenticate
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new UnauthorizedError();

  const userId = (session.user as { id: string }).id;

  // 2. Check plan eligibility
  await requireTrafficAccess(userId);

  // 3. Fetch company for the authenticated user
  const company = await prisma.company.findUnique({ where: { userId } });

  if (!company) {
    return NextResponse.json(
      { error: "Empresa não encontrada para o usuário autenticado." },
      { status: 404 },
    );
  }

  // 4. Get budget recommendations
  const recommendations = await budgetIntelligenceService.getRecommendations(company.id);

  return NextResponse.json(recommendations, { status: 200 });
});
