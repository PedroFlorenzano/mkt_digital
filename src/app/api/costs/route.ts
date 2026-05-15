import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@server/lib/auth";
import { costService } from "@server/services/cost.service";
import { withErrorHandler } from "@server/lib/api-handler";
import { UnauthorizedError } from "@server/lib/errors";

export const GET = withErrorHandler(async (request: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new UnauthorizedError();

  const userId = (session.user as { id: string }).id;
  const { searchParams } = new URL(request.url);
  const period = searchParams.get("period") ?? "month";

  const data = await costService.getByUserId(userId, period);
  return NextResponse.json(data);
});
