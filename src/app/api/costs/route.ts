import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@server/lib/auth";
import { costService } from "@server/services/cost.service";
import { companyService } from "@server/services/company.service";
import { withErrorHandler } from "@server/lib/api-handler";
import { UnauthorizedError } from "@server/lib/errors";

export const GET = withErrorHandler(async (request: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new UnauthorizedError();

  const userId = session.user.id;
  const activeCompanyId = session.user.activeCompanyId;
  if (!activeCompanyId) throw new UnauthorizedError("Nenhuma empresa selecionada");

  const { searchParams } = new URL(request.url);
  const period = searchParams.get("period") ?? "month";

  const company = await companyService.assertOwnership(userId, activeCompanyId);
  const data = await costService.getByCompanyId(company.id, period);
  return NextResponse.json(data);
});
