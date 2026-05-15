/**
 * seed-mock-campaigns.mjs
 * Cria campanhas mockadas para POC/teste no banco SQLite.
 * Uso: node scripts/seed-mock-campaigns.mjs
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

async function main() {
  // Busca o usuário demo
  const user = await prisma.user.findUnique({ where: { email: "demo@mktdigital.com" } });
  if (!user) throw new Error("Usuário demo não encontrado. Rode o seed primeiro.");

  const company = await prisma.company.findUnique({ where: { userId: user.id } });
  if (!company) throw new Error("Empresa demo não encontrada.");

  console.log("Empresa:", company.name);

  // Garante que existe um credential mockado para meta e google
  const metaCred = await prisma.adPlatformCredential.upsert({
    where: { companyId_platform: { companyId: company.id, platform: "meta" } },
    update: {},
    create: {
      companyId: company.id,
      platform: "meta",
      encryptedData: JSON.stringify({ iv: "mock-iv-meta", tag: "mock-tag", data: "mock-data" }),
      isValid: true,
      validatedAt: new Date(),
    },
  });

  const googleCred = await prisma.adPlatformCredential.upsert({
    where: { companyId_platform: { companyId: company.id, platform: "google" } },
    update: {},
    create: {
      companyId: company.id,
      platform: "google",
      encryptedData: JSON.stringify({ iv: "mock-iv-google", tag: "mock-tag", data: "mock-data" }),
      isValid: true,
      validatedAt: new Date(),
    },
  });

  console.log("Credenciais mockadas criadas.");

  // Define as campanhas mockadas
  const campaigns = [
    {
      credentialId: metaCred.id,
      platform: "meta",
      campaignType: "social",
      name: "Campanha Awareness — Tech Solutions",
      objective: "Aumentar reconhecimento de marca entre empreendedores digitais em São Paulo",
      dailyBudgetBrl: 150,
      status: "active",
      externalCampaignId: "mock-meta-camp-001",
      externalAdSetId: "mock-meta-adset-001",
      externalAdIds: JSON.stringify(["mock-meta-ad-001", "mock-meta-ad-002"]),
      managerUrl: "https://www.facebook.com/adsmanager/manage/campaigns",
      launchedAt: daysAgo(20),
      metrics: [
        { daysBack: 1, impressions: 12400, clicks: 310, conversions: 18, spendBrl: 148.50, ctr: 0.025, cpc: 0.48, roas: 3.8 },
        { daysBack: 2, impressions: 11800, clicks: 295, conversions: 15, spendBrl: 143.20, ctr: 0.025, cpc: 0.49, roas: 3.5 },
        { daysBack: 3, impressions: 13100, clicks: 328, conversions: 21, spendBrl: 149.00, ctr: 0.025, cpc: 0.45, roas: 4.1 },
        { daysBack: 7, impressions: 10900, clicks: 218, conversions: 12, spendBrl: 130.00, ctr: 0.020, cpc: 0.60, roas: 2.9 },
        { daysBack: 14, impressions: 9800,  clicks: 196, conversions: 10, spendBrl: 120.00, ctr: 0.020, cpc: 0.61, roas: 2.5 },
      ],
    },
    {
      credentialId: metaCred.id,
      platform: "meta",
      campaignType: "social",
      name: "Campanha Conversão — Workshop Digital",
      objective: "Gerar inscrições para workshop online de transformação digital",
      dailyBudgetBrl: 80,
      status: "active",
      externalCampaignId: "mock-meta-camp-002",
      externalAdSetId: "mock-meta-adset-002",
      externalAdIds: JSON.stringify(["mock-meta-ad-003"]),
      managerUrl: "https://www.facebook.com/adsmanager/manage/campaigns",
      launchedAt: daysAgo(10),
      metrics: [
        { daysBack: 1, impressions: 8200,  clicks: 492, conversions: 38, spendBrl: 78.40, ctr: 0.060, cpc: 0.16, roas: 5.2 },
        { daysBack: 2, impressions: 7900,  clicks: 474, conversions: 35, spendBrl: 75.00, ctr: 0.060, cpc: 0.16, roas: 4.9 },
        { daysBack: 3, impressions: 8500,  clicks: 510, conversions: 41, spendBrl: 80.00, ctr: 0.060, cpc: 0.16, roas: 5.5 },
        { daysBack: 7, impressions: 7100,  clicks: 284, conversions: 20, spendBrl: 65.00, ctr: 0.040, cpc: 0.23, roas: 3.8 },
      ],
    },
    {
      credentialId: googleCred.id,
      platform: "google",
      campaignType: "search",
      name: "Google Search — Consultoria TI",
      objective: "Capturar leads de empresas buscando consultoria em tecnologia",
      dailyBudgetBrl: 200,
      status: "active",
      externalCampaignId: "mock-google-camp-001",
      externalAdSetId: "mock-google-adgroup-001",
      externalAdIds: JSON.stringify(["mock-google-ad-001", "mock-google-ad-002", "mock-google-ad-003"]),
      managerUrl: "https://ads.google.com/aw/campaigns",
      launchedAt: daysAgo(30),
      metrics: [
        { daysBack: 1, impressions: 4300,  clicks: 387, conversions: 29, spendBrl: 195.00, ctr: 0.090, cpc: 0.50, roas: 4.2 },
        { daysBack: 2, impressions: 4100,  clicks: 369, conversions: 25, spendBrl: 188.00, ctr: 0.090, cpc: 0.51, roas: 3.9 },
        { daysBack: 3, impressions: 4600,  clicks: 414, conversions: 32, spendBrl: 200.00, ctr: 0.090, cpc: 0.48, roas: 4.5 },
        { daysBack: 7, impressions: 3900,  clicks: 312, conversions: 18, spendBrl: 170.00, ctr: 0.080, cpc: 0.54, roas: 3.1 },
        { daysBack: 14, impressions: 3500,  clicks: 245, conversions: 12, spendBrl: 155.00, ctr: 0.070, cpc: 0.63, roas: 2.4 },
        { daysBack: 21, impressions: 3200,  clicks: 192, conversions: 8,  spendBrl: 140.00, ctr: 0.060, cpc: 0.73, roas: 1.8 },
      ],
    },
    {
      credentialId: googleCred.id,
      platform: "google",
      campaignType: "display",
      name: "Google Display — Remarketing PME",
      objective: "Reimpactar visitantes do site que não converteram",
      dailyBudgetBrl: 60,
      status: "paused",
      externalCampaignId: "mock-google-camp-002",
      externalAdSetId: "mock-google-adgroup-002",
      externalAdIds: JSON.stringify(["mock-google-ad-004"]),
      managerUrl: "https://ads.google.com/aw/campaigns",
      launchedAt: daysAgo(45),
      metrics: [
        { daysBack: 8,  impressions: 28000, clicks: 140, conversions: 4,  spendBrl: 58.00, ctr: 0.005, cpc: 0.41, roas: 1.1 },
        { daysBack: 15, impressions: 26500, clicks: 132, conversions: 3,  spendBrl: 55.00, ctr: 0.005, cpc: 0.42, roas: 0.9 },
      ],
    },
    {
      credentialId: metaCred.id,
      platform: "meta",
      campaignType: "social",
      name: "Campanha Leads — Automação Empresarial",
      objective: "Gerar leads qualificados de médias empresas para proposta de automação",
      dailyBudgetBrl: 120,
      status: "active",
      externalCampaignId: "mock-meta-camp-003",
      externalAdSetId: "mock-meta-adset-003",
      externalAdIds: JSON.stringify(["mock-meta-ad-005", "mock-meta-ad-006"]),
      managerUrl: "https://www.facebook.com/adsmanager/manage/campaigns",
      launchedAt: daysAgo(5),
      metrics: [
        { daysBack: 1, impressions: 6100, clicks: 244, conversions: 22, spendBrl: 115.00, ctr: 0.040, cpc: 0.47, roas: 4.8 },
        { daysBack: 2, impressions: 5800, clicks: 232, conversions: 19, spendBrl: 110.00, ctr: 0.040, cpc: 0.47, roas: 4.3 },
        { daysBack: 3, impressions: 6400, clicks: 256, conversions: 24, spendBrl: 120.00, ctr: 0.040, cpc: 0.47, roas: 5.1 },
      ],
    },
  ];

  let createdCount = 0;
  let metricsCount = 0;

  for (const c of campaigns) {
    const { metrics, ...campaignData } = c;

    // Check if already exists
    const existing = await prisma.adCampaign.findFirst({
      where: { companyId: company.id, externalCampaignId: campaignData.externalCampaignId },
    });

    let campaign;
    if (existing) {
      campaign = existing;
      console.log(`Campanha já existe, pulando: ${campaignData.name}`);
    } else {
      campaign = await prisma.adCampaign.create({
        data: { ...campaignData, companyId: company.id },
      });
      createdCount++;
      console.log(`✅ Campanha criada: ${campaign.name} [${campaign.platform}/${campaign.status}]`);

      // Audit log
      await prisma.campaignAuditLog.create({
        data: {
          companyId: company.id,
          campaignId: campaign.id,
          actionType: "campaign_created",
          source: "user",
          newValues: JSON.stringify({ platform: campaign.platform, externalCampaignId: campaign.externalCampaignId }),
        },
      });
    }

    // Seed metric snapshots
    for (const m of metrics) {
      const collectedAt = daysAgo(m.daysBack);
      const periodStart = new Date(collectedAt.getTime() - 6 * 3600 * 1000);

      const existingSnapshot = await prisma.adMetricSnapshot.findFirst({
        where: { campaignId: campaign.id, collectedAt: { gte: daysAgo(m.daysBack + 0.1), lte: daysAgo(m.daysBack - 0.1) } },
      });

      if (!existingSnapshot) {
        await prisma.adMetricSnapshot.create({
          data: {
            campaignId: campaign.id,
            collectedAt,
            periodStart,
            periodEnd: collectedAt,
            impressions: m.impressions,
            clicks: m.clicks,
            conversions: m.conversions,
            spendBrl: m.spendBrl,
            ctr: m.ctr,
            cpc: m.cpc,
            roas: m.roas,
            rawJson: JSON.stringify({ mock: true }),
          },
        });
        metricsCount++;
      }
    }
  }

  console.log("\n────────────────────────────────");
  console.log(`✅ ${createdCount} campanhas criadas`);
  console.log(`📊 ${metricsCount} snapshots de métricas inseridos`);
  console.log("Acesse http://localhost:3030/paid-traffic para ver as campanhas.");
}

main().catch(console.error).finally(() => prisma.$disconnect());
