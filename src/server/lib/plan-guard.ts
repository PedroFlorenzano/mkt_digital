import { prisma } from "@server/lib/prisma";
import { ForbiddenError } from "@server/lib/errors";

const ELIGIBLE_PLANS = ["Profissional", "Agencia"];

/**
 * Verifies that the user has an active subscription on an eligible plan
 * (Profissional or Agencia) to access AI Paid Traffic features.
 *
 * Throws ForbiddenError if the user is not eligible.
 * No caching — verification happens on every request.
 */
export async function requireTrafficAccess(userId: string): Promise<void> {
  const subscription = await prisma.subscription.findFirst({
    where: {
      userId,
      status: { in: ["active", "trialing"] },
    },
    include: { plan: true },
  });

  if (!subscription || !ELIGIBLE_PLANS.includes(subscription.plan.name)) {
    throw new ForbiddenError(
      "Este recurso está disponível apenas nos planos Profissional e Agência.",
    );
  }
}
