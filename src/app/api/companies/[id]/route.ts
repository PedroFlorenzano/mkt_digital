import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@server/lib/auth";
import { companyService } from "@server/services/company.service";
import { withErrorHandler } from "@server/lib/api-handler";
import { UnauthorizedError, ForbiddenError } from "@server/lib/errors";
import type { CompanyInput } from "@/types/company";

/**
 * Extracts the company [id] segment from the URL path.
 * Path shape: /api/companies/[id]
 */
function extractCompanyId(url: string): string | null {
  const segments = new URL(url).pathname.split("/");
  // segments: ["", "api", "companies", "<id>"]
  const companiesIndex = segments.indexOf("companies");
  const id = companiesIndex >= 0 ? (segments[companiesIndex + 1] ?? null) : null;
  return id && id !== "" ? id : null;
}

/**
 * PATCH /api/companies/[id]
 * Updates the fields of a company owned by the authenticated user.
 *
 * Responses:
 *   200 — updated Company JSON
 *   401 — no active session
 *   403 — company not found or not owned by the user (opaque)
 *   422 — validation error (e.g. name out of [2, 200] chars)
 */
export const PATCH = withErrorHandler(async (request: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new UnauthorizedError();

  const companyId = extractCompanyId(request.url);
  if (!companyId) throw new ForbiddenError("Acesso negado.");

  const userId = session.user.id;

  // assertOwnership throws ForbiddenError (403) if not owned or not found
  await companyService.assertOwnership(userId, companyId);

  const body = (await request.json()) as Partial<CompanyInput>;

  const updated = await companyService.updateCompany(userId, companyId, body);

  return NextResponse.json(updated);
});

/**
 * DELETE /api/companies/[id]
 * Removes a company (and all child records) owned by the authenticated user.
 *
 * Responses:
 *   200 — { ok: true }
 *   401 — no active session
 *   403 — company not found or not owned by the user (opaque)
 */
export const DELETE = withErrorHandler(async (request: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new UnauthorizedError();

  const companyId = extractCompanyId(request.url);
  if (!companyId) throw new ForbiddenError("Acesso negado.");

  const userId = session.user.id;

  // assertOwnership throws ForbiddenError (403) if not owned or not found
  await companyService.assertOwnership(userId, companyId);

  await companyService.deleteCompany(userId, companyId);

  return NextResponse.json({ ok: true });
});
