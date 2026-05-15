import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@server/lib/auth";
import { prisma } from "@server/lib/prisma";
import { withErrorHandler } from "@server/lib/api-handler";
import { UnauthorizedError } from "@server/lib/errors";

// ---------------------------------------------------------------------------
// GET /api/user/plan
// Returns the user's current subscription plan.
// Returns { plan: { name: string } | null }
// ---------------------------------------------------------------------------
export const GET = withErrorHandler(async (_request: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new UnauthorizedError();

  const userId = (session.user as { id: string }).id;

  const subscription = await prisma.subscription.findFirst({
    where: {
      userId,
      status: { in: ["active", "trialing"] },
    },
    include: { plan: true },
  });

  return NextResponse.json({
    plan: subscription ? { name: subscription.plan.name } : null,
  });
});
