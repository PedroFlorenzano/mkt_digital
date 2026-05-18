import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@server/lib/auth";
import { prisma } from "@server/lib/prisma";
import { companyService } from "@server/services/company.service";
import { withErrorHandler } from "@server/lib/api-handler";
import { UnauthorizedError } from "@server/lib/errors";

export const GET = withErrorHandler(async (request: Request) => {
  // 1. Authenticate
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new UnauthorizedError();

  const userId = session.user.id;
  const activeCompanyId = session.user.activeCompanyId;
  if (!activeCompanyId) throw new UnauthorizedError("Nenhuma empresa selecionada");

  // 3. Parse query parameters
  const { searchParams } = new URL(request.url);

  const campaignId = searchParams.get("campaignId") ?? undefined;
  const actionType = searchParams.get("actionType") ?? undefined;
  const sinceParam = searchParams.get("since");
  const untilParam = searchParams.get("until");
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const pageSize = parseInt(searchParams.get("pageSize") ?? "50", 10);

  const since = sinceParam ? new Date(sinceParam) : undefined;
  const until = untilParam ? new Date(untilParam) : undefined;

  // 4. Verify ownership and resolve company
  const company = await companyService.assertOwnership(userId, activeCompanyId);

  // 5. Build shared where clause
  const where = {
    companyId: company.id,
    ...(campaignId ? { campaignId } : {}),
    ...(actionType ? { actionType } : {}),
    ...((since || until)
      ? {
          createdAt: {
            ...(since ? { gte: since } : {}),
            ...(until ? { lte: until } : {}),
          },
        }
      : {}),
  };

  // 6. Run paginated query and count in parallel
  const skip = (page - 1) * pageSize;

  const [data, total] = await Promise.all([
    prisma.campaignAuditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.campaignAuditLog.count({ where }),
  ]);

  return NextResponse.json({ data, total, page, pageSize }, { status: 200 });
});

