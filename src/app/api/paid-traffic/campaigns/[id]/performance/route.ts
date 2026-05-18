import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@server/lib/auth";
import { requireTrafficAccess } from "@server/lib/plan-guard";
import { campaignService } from "@server/services/campaign.service";
import { companyService } from "@server/services/company.service";
import { withErrorHandler } from "@server/lib/api-handler";
import { UnauthorizedError } from "@server/lib/errors";

/**
 * GET /api/paid-traffic/campaigns/[id]/performance
 *
 * Returns an AI-generated performance report for the given campaign, scoped
 * to the authenticated user's company and the requested time window.
 *
 * Query params:
 *   since  — ISO 8601 date (required)  — start of the analysis period
 *   until  — ISO 8601 date (required)  — end of the analysis period
 *
 * Responses:
 *   200  — PerformanceReport
 *   400  — invalid / missing since or until
 *   401  — not authenticated
 *   404  — campaign not found or not owned by this company
 *   502  — Bedrock unavailable
 */
export const GET = withErrorHandler(async (request: Request) => {
  // 1. Authenticate
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new UnauthorizedError();

  const userId = session.user.id;
  const activeCompanyId = session.user.activeCompanyId;
  if (!activeCompanyId) throw new UnauthorizedError("Nenhuma empresa selecionada");

  // 2. Check plan eligibility
  await requireTrafficAccess(userId);

  // 3. Extract campaign id from URL path
  // Path: /api/paid-traffic/campaigns/[id]/performance
  const url = new URL(request.url);
  const pathSegments = url.pathname.split("/");
  // Find "campaigns" segment and take the next one
  const campaignsIndex = pathSegments.indexOf("campaigns");
  const campaignId =
    campaignsIndex >= 0 ? pathSegments[campaignsIndex + 1] : undefined;

  if (!campaignId) {
    return NextResponse.json(
      { error: "Parâmetro de rota 'id' ausente." },
      { status: 400 },
    );
  }

  // 4. Parse and validate query params
  const sinceParam = url.searchParams.get("since");
  const untilParam = url.searchParams.get("until");

  if (!sinceParam || !untilParam) {
    return NextResponse.json(
      { error: "Os parâmetros 'since' e 'until' são obrigatórios." },
      { status: 400 },
    );
  }

  const sinceDate = new Date(sinceParam);
  const untilDate = new Date(untilParam);

  if (isNaN(sinceDate.getTime())) {
    return NextResponse.json(
      { error: "Parâmetro 'since' não é uma data ISO válida." },
      { status: 400 },
    );
  }

  if (isNaN(untilDate.getTime())) {
    return NextResponse.json(
      { error: "Parâmetro 'until' não é uma data ISO válida." },
      { status: 400 },
    );
  }

  // 5. Verify ownership and resolve company
  const company = await companyService.assertOwnership(userId, activeCompanyId);

  // 6. Generate performance report via service
  const report = await campaignService.getPerformanceReport(
    company.id,
    campaignId,
    sinceDate,
    untilDate,
  );

  return NextResponse.json(report, { status: 200 });
});
