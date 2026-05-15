import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findUnique({ where: { email: "demo@mktdigital.com" } });
  if (!user) {
    console.log("Demo user not found");
    return;
  }
  console.log("Found user:", user.id);

  const plan = await prisma.plan.upsert({
    where: { id: "plan-agencia" },
    update: { name: "Agencia", isActive: true },
    create: {
      id: "plan-agencia",
      name: "Agencia",
      priceMonthlyUsd: 599,
      priceYearlyUsd: 5990,
      aiImageCreditsPerMonth: 9999,
      aiTextCreditsPerMonth: 9999,
      isActive: true,
    },
  });
  console.log("Plan upserted:", plan.name);

  const now = new Date();
  const sub = await prisma.subscription.upsert({
    where: { userId: user.id },
    update: {
      planId: plan.id,
      status: "active",
      currentPeriodEnd: new Date(now.getFullYear() + 2, now.getMonth(), now.getDate()),
    },
    create: {
      userId: user.id,
      planId: plan.id,
      status: "active",
      currentPeriodStart: now,
      currentPeriodEnd: new Date(now.getFullYear() + 2, now.getMonth(), now.getDate()),
      paymentProvider: "demo",
    },
  });
  console.log("Subscription upserted, status:", sub.status);
  console.log("Done! Demo user now has Agencia plan.");
}

main().catch(console.error).finally(() => prisma.$disconnect());
