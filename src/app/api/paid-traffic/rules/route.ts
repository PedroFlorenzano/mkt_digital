import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@server/lib/auth";
import { prisma } from "@server/lib/prisma";
import { requireTrafficAccess } from "@server/lib/plan-guard";
import { automationRulesService } from "@server/services/automation-rules.service";
import type { CreateRuleInput } from "@server/services/automation-rules.service";
import { withErrorHandler } from "@server/lib/api-handler";
import { UnauthorizedError } from "@server/lib/errors";

// ---------------------------------------------------------------------------
// POST /api/paid-traffic/rules — Create a new automation rule
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

  const { name, condition, action, campaignId } = body as {
    name?: unknown;
    condition?: unknown;
    action?: unknown;
    campaignId?: unknown;
  };

  if (typeof name !== "string" || name.trim() === "") {
    return NextResponse.json(
      { error: "O campo 'name' é obrigatório." },
      { status: 400 },
    );
  }

  if (
    typeof condition !== "object" ||
    condition === null ||
    !("metric" in condition) ||
    !("operator" in condition) ||
    !("value" in condition)
  ) {
    return NextResponse.json(
      { error: "O campo 'condition' é obrigatório e deve conter metric, operator e value." },
      { status: 400 },
    );
  }

  if (
    typeof action !== "object" ||
    action === null ||
    !("type" in action)
  ) {
    return NextResponse.json(
      { error: "O campo 'action' é obrigatório e deve conter type." },
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

  // 5. Build input and create the rule
  const input: CreateRuleInput = {
    companyId: company.id,
    name: name.trim(),
    condition: condition as CreateRuleInput["condition"],
    action: action as CreateRuleInput["action"],
    ...(typeof campaignId === "string" ? { campaignId } : {}),
  };

  const rule = await automationRulesService.create(input);

  return NextResponse.json(rule, { status: 201 });
});

// ---------------------------------------------------------------------------
// GET /api/paid-traffic/rules — List automation rules
// ---------------------------------------------------------------------------
export const GET = withErrorHandler(async (request: Request) => {
  // 1. Authenticate
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new UnauthorizedError();

  const userId = (session.user as { id: string }).id;

  // 2. Check plan eligibility
  await requireTrafficAccess(userId);

  // 3. Accept optional campaignId query param (for documentation/filtering intent)
  const url = new URL(request.url);
  const _campaignId = url.searchParams.get("campaignId"); // passed for documentation; not used to filter at this level

  // 4. Fetch company
  const company = await prisma.company.findUnique({ where: { userId } });

  if (!company) {
    return NextResponse.json(
      { error: "Empresa não encontrada para o usuário autenticado." },
      { status: 404 },
    );
  }

  // 5. List all rules for the company
  const rules = await automationRulesService.listByCompany(company.id);

  return NextResponse.json(rules, { status: 200 });
});
