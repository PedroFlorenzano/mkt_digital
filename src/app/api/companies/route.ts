import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@server/lib/auth";
import { companyService } from "@server/services/company.service";
import { withErrorHandler } from "@server/lib/api-handler";
import { UnauthorizedError } from "@server/lib/errors";
import type { CompanyInput } from "@/types/company";

/**
 * GET /api/companies
 * Returns the list of companies owned by the authenticated user (portfolio).
 */
export const GET = withErrorHandler(async () => {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new UnauthorizedError();

  const companies = await companyService.listByUserId(session.user.id);

  return NextResponse.json(companies);
});

/**
 * POST /api/companies
 * Creates a new company for the authenticated user.
 * Respects plan limits enforced by companyService.createCompany.
 */
export const POST = withErrorHandler(async (request: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new UnauthorizedError();

  const body = (await request.json()) as CompanyInput;

  const company = await companyService.createCompany(session.user.id, body);

  return NextResponse.json(company, { status: 201 });
});
