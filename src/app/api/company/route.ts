import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@server/lib/auth";
import { companyService } from "@server/services/company.service";
import { companyRepository } from "@server/repositories/company.repository";
import { withErrorHandler } from "@server/lib/api-handler";
import { UnauthorizedError } from "@server/lib/errors";

function parseColors(colors: unknown): string[] {
  if (typeof colors === "string") {
    try {
      const parsed = JSON.parse(colors) as unknown;
      if (Array.isArray(parsed)) return parsed.filter((c): c is string => typeof c === "string");
    } catch { /* ignore */ }
  }
  if (Array.isArray(colors)) return colors.filter((c): c is string => typeof c === "string");
  return [];
}

export const GET = withErrorHandler(async () => {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new UnauthorizedError();

  const userId = session.user.id;
  const activeCompanyId = session.user.activeCompanyId;

  if (!activeCompanyId) throw new UnauthorizedError("No active company selected");

  // Verify ownership (throws ForbiddenError if not owned)
  await companyService.assertOwnership(userId, activeCompanyId);

  const company = await companyRepository.findByIdWithSocial(activeCompanyId);

  if (!company) return NextResponse.json(null);

  return NextResponse.json({
    ...company,
    colors: parseColors(company.colors),
  });
});

export const POST = withErrorHandler(async (request: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new UnauthorizedError();

  const userId = session.user.id;
  const activeCompanyId = session.user.activeCompanyId;

  if (!activeCompanyId) throw new UnauthorizedError("No active company selected");

  const body = await request.json() as Record<string, unknown>;

  const company = await companyService.updateCompany(userId, activeCompanyId, {
    name: typeof body["name"] === "string" ? body["name"] : undefined,
    description: typeof body["description"] === "string" ? body["description"] : undefined,
    sector: typeof body["sector"] === "string" ? body["sector"] : undefined,
    objective: typeof body["objective"] === "string" ? body["objective"] : undefined,
    tone: typeof body["tone"] === "string" ? body["tone"] : undefined,
    colors: Array.isArray(body["colors"]) ? (body["colors"] as string[]) : undefined,
    driveUrl: typeof body["driveUrl"] === "string" ? body["driveUrl"] : undefined,
  });

  return NextResponse.json({
    ...company,
    colors: parseColors(company.colors),
  });
});
