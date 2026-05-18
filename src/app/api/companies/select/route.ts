import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@server/lib/auth";
import { companyService } from "@server/services/company.service";
import { withErrorHandler } from "@server/lib/api-handler";
import { UnauthorizedError, ValidationError } from "@server/lib/errors";

export const POST = withErrorHandler(async (request: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new UnauthorizedError();

  const userId = (session.user as { id: string }).id;
  const body = (await request.json()) as Record<string, unknown>;
  const companyId = typeof body["companyId"] === "string" ? body["companyId"] : "";

  if (!companyId) {
    throw new ValidationError("companyId é obrigatório");
  }

  const company = await companyService.assertOwnership(userId, companyId);

  return NextResponse.json({ ok: true, activeCompanyId: company.id });
});
