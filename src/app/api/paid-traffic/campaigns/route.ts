import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@server/lib/auth";
import { prisma } from "@server/lib/prisma";
import { requireTrafficAccess } from "@server/lib/plan-guard";
import { campaignService } from "@server/services/campaign.service";
import { withErrorHandler } from "@server/lib/api-handler";
import { UnauthorizedError } from "@server/lib/errors";
import type { CampaignDraft } from "@server/services/campaign.service";
import type { AdPlatform } from "@server/services/credential.service";

// ---------------------------------------------------------------------------
// POST /api/paid-traffic/campaigns
// Launches a campaign draft onto one or more ad platforms.
// Body: { draft: CampaignDraft, platforms: AdPlatform[] }
// Returns HTTP 201 with AdCampaign[]
// ---------------------------------------------------------------------------
export const POST = withErrorHandler(async (request: Request) => {
  // 1. Authenticate
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new UnauthorizedError();

  const userId = (session.user as { id: string }).id;

  // 2. Check plan eligibility
  await requireTrafficAccess(userId);

  // 3. Parse and validate body
  const body = await request.json() as Record<string, unknown>;
  const { draft, platforms } = body as {
    draft?: CampaignDraft;
    platforms?: AdPlatform[];
  };

  if (!draft || typeof draft !== "object") {
    return NextResponse.json(
      { error: "O campo 'draft' é obrigatório e deve ser um objeto CampaignDraft." },
      { status: 400 },
    );
  }

  if (!Array.isArray(platforms) || platforms.length === 0) {
    return NextResponse.json(
      { error: "O campo 'platforms' é obrigatório e deve ser um array não-vazio de plataformas." },
      { status: 400 },
    );
  }

  const validPlatforms: AdPlatform[] = ["meta", "google"];
  for (const p of platforms) {
    if (!validPlatforms.includes(p)) {
      return NextResponse.json(
        { error: `Plataforma inválida: '${p}'. Use 'meta' ou 'google'.` },
        { status: 400 },
      );
    }
  }

  // 4. Fetch company for the authenticated user
  const company = await prisma.company.findUnique({ where: { userId } });

  if (!company) {
    return NextResponse.json(
      { error: "Empresa não encontrada para o usuário autenticado." },
      { status: 404 },
    );
  }

  // 5. Launch campaigns — ValidationError (missing credentials) is handled by withErrorHandler
  const campaigns = await campaignService.launch(company.id, draft, platforms);

  return NextResponse.json(campaigns, { status: 201 });
});

// ---------------------------------------------------------------------------
// GET /api/paid-traffic/campaigns
// Returns a paginated list of campaigns with the most recent metric snapshot.
// Query params: page (default 1), pageSize (default 20), status (optional)
// Returns HTTP 200 with { data, total, page, pageSize }
// ---------------------------------------------------------------------------
export const GET = withErrorHandler(async (request: Request) => {
  // 1. Authenticate
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new UnauthorizedError();

  const userId = (session.user as { id: string }).id;

  // 2. Check plan eligibility
  await requireTrafficAccess(userId);

  // 3. Parse query params
  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") ?? "1", 10) || 1;
  const pageSize = parseInt(searchParams.get("pageSize") ?? "20", 10) || 20;
  const status = searchParams.get("status") ?? undefined;

  // 4. Fetch company for the authenticated user
  const company = await prisma.company.findUnique({ where: { userId } });

  if (!company) {
    return NextResponse.json(
      { error: "Empresa não encontrada para o usuário autenticado." },
      { status: 404 },
    );
  }

  // 5. List campaigns with latest metrics
  const result = await campaignService.listByCompany(company.id, {
    page,
    pageSize,
    status,
  });

  return NextResponse.json(
    {
      data: result.data,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
    },
    { status: 200 },
  );
});
