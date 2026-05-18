import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const hashedPassword = await bcrypt.hash("demo123", 12);

  const user = await prisma.user.upsert({
    where: { email: "demo@mktdigital.com" },
    update: {},
    create: {
      name: "Usuário Demo",
      email: "demo@mktdigital.com",
      password: hashedPassword,
    },
  });

  const company = await prisma.company.upsert({
    where: { id: "company-demo" },
    update: {},
    create: {
      id: "company-demo",
      userId: user.id,
      name: "Tech Solutions Brasil",
      description: "Empresa de consultoria em tecnologia e transformação digital para PMEs",
      sector: "Tecnologia",
      objective: "Gerar leads qualificados e fortalecer autoridade no mercado",
      tone: "professional",
      colors: JSON.stringify(["#3B82F6", "#1E40AF", "#F8FAFC"]),
    },
  });

  await prisma.socialAccount.upsert({
    where: { companyId_platform: { companyId: company.id, platform: "instagram" } },
    update: {},
    create: {
      companyId: company.id,
      platform: "instagram",
      profileName: "@techsolutions.br",
      connected: true,
      accessToken: "demo-token",
      profileId: "demo-profile-id",
    },
  });

  await prisma.socialAccount.upsert({
    where: { companyId_platform: { companyId: company.id, platform: "linkedin" } },
    update: {},
    create: {
      companyId: company.id,
      platform: "linkedin",
      profileName: "Tech Solutions Brasil",
      connected: true,
      accessToken: "demo-token",
      profileId: "demo-profile-id",
    },
  });

  const now = new Date();

  await prisma.post.createMany({
    data: [
      {
        companyId: company.id,
        platform: "instagram",
        content: "Transformação digital não é sobre tecnologia — é sobre pessoas. Sua equipe está pronta para o próximo nível? 🚀\n\n#TransformaçãoDigital #Tecnologia #Inovação #PME",
        imageUrl: "https://placehold.co/1080x1080/3B82F6/FFFFFF?text=Tech+Solutions",
        status: "published",
        publishedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
        createdAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
      },
      {
        companyId: company.id,
        platform: "linkedin",
        content: "5 sinais de que sua empresa precisa de consultoria em tecnologia:\n\n1. Processos manuais que consomem mais de 20h/semana\n2. Dados espalhados em planilhas sem integração\n3. Equipe resistente a novas ferramentas\n4. Concorrentes digitalizando mais rápido\n5. Investimentos em TI sem ROI claro\n\nSe identificou 2 ou mais? Vamos conversar.",
        status: "scheduled",
        scheduledAt: new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000),
        createdAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
      },
      {
        companyId: company.id,
        platform: "instagram",
        content: "Case de sucesso: como ajudamos uma distribuidora a reduzir 40% do tempo operacional com automação.\n\nResultados em 3 meses:\n✅ -40% tempo em processos manuais\n✅ +25% produtividade da equipe\n✅ ROI positivo no 2º mês\n\n#CaseDeSuccesso #Automação #Resultados",
        imageUrl: "https://placehold.co/1080x1080/1E40AF/FFFFFF?text=Case+de+Sucesso",
        status: "draft",
        createdAt: now,
      },
      {
        companyId: company.id,
        platform: "facebook",
        content: "📢 Workshop gratuito: Primeiros passos na transformação digital para pequenas empresas.\n\nData: próxima quinta-feira, 19h\nLocal: Online (link no bio)\n\nVagas limitadas! Comente 'EU QUERO' para garantir a sua.",
        status: "draft",
        createdAt: now,
      },
    ],
  });

  // ── Agencia plan + subscription for demo user ─────────────────────────────
  const agenciaPlan = await prisma.plan.upsert({
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

  const now2 = new Date();
  await prisma.subscription.upsert({
    where: { userId: user.id },
    update: {
      planId: agenciaPlan.id,
      status: "active",
      currentPeriodEnd: new Date(now2.getFullYear() + 2, now2.getMonth(), now2.getDate()),
    },
    create: {
      userId: user.id,
      planId: agenciaPlan.id,
      status: "active",
      currentPeriodStart: now2,
      currentPeriodEnd: new Date(now2.getFullYear() + 2, now2.getMonth(), now2.getDate()),
      paymentProvider: "demo",
    },
  });

  console.log("Seed executado com sucesso!");
  console.log("---");
  console.log("Credenciais de demo:");
  console.log("Email: demo@mktdigital.com");
  console.log("Senha: demo123");
  console.log("Plano: Agencia (acesso total)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
