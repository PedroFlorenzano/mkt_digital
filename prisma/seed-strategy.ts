/**
 * seed-strategy.ts
 *
 * Popula dados ricos de Tráfego Pago especificamente para testar a
 * Análise Estratégica (GET /api/paid-traffic/strategy).
 *
 * Requisitos do serviço:
 *   - Campanha com status "active"
 *   - AdMetricSnapshot dos últimos 30 dias
 *   - Mínimo 7 dias DISTINTOS de snapshots por campanha
 *
 * Critérios do diagnóstico (definidos no strategic-analyst.service.ts):
 *   portfolioAvgRoas = média de ROAS de todas as campanhas qualificadas
 *
 *   PONTOS FORTES (strengths):
 *     - ROAS > 2 × portfolioAvgRoas   (excelência relativa ao portfólio)
 *     - CTR  > 3%                     (engajamento acima da média)
 *
 *   ALERTAS (alerts):
 *     - CTR  < 1%                     (engajamento muito baixo)
 *     - ROAS < 1.5                    (retorno insuficiente)
 *     - CPC  > 2 × portfolioAvgCpc    (custo por clique excessivo)
 *
 * CENÁRIOS CRIADOS  (empresa: company-tech, usuário: demo@mktdigital.com)
 * ──────────────────────────────────────────────────────────────────────
 *  ID                            │ Situação deliberada
 *  ──────────────────────────────────────────────────
 *  strat-camp-ESTRELA            │ Ponto forte: ROAS 4.8x, CTR 5.2%
 *  strat-camp-PROMISSORA         │ Ponto forte: CTR 4.1% mas ROAS moderado
 *  strat-camp-ALERTA-CTR         │ Alerta: CTR 0.5% (abaixo de 1%)
 *  strat-camp-ALERTA-ROAS        │ Alerta: ROAS 0.9x (abaixo de 1.5)
 *  strat-camp-ALERTA-CPC         │ Alerta: CPC muito alto vs portfólio
 *  strat-camp-NOVA               │ Apenas 3 dias → EXCLUÍDA (dados insuficientes)
 *
 * portfolioAvgRoas ≈ (4.8 + 2.1 + 0.9 + 1.2 + 3.5) / 5 = 2.5x
 *   → threshold pontos fortes: ROAS > 5.0x
 *   → ESTRELA fica no limite; CTR > 3% classifica ESTRELA e PROMISSORA
 *
 * Como executar:
 *   npx tsx prisma/seed-strategy.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ─── helpers ────────────────────────────────────────────────────────────────

const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000);

/** Gera um snapshot diário com pequena variação aleatória */
function snap(
  campaignId: string,
  dayOffset: number,
  base: {
    impressions: number;
    clicks: number;
    conversions: number;
    spendBrl: number;
    ctr: number;
    cpc: number;
    roas: number;
  },
  jitter = 0.08,
) {
  const j = (v: number) => v * (1 + (Math.random() * 2 - 1) * jitter);
  const day = daysAgo(dayOffset);
  return {
    campaignId,
    collectedAt: day,
    periodStart: new Date(day.getTime() - 6 * 3_600_000),
    periodEnd: day,
    impressions: Math.round(j(base.impressions)),
    clicks: Math.round(j(base.clicks)),
    conversions: Math.round(j(base.conversions)),
    spendBrl: parseFloat(j(base.spendBrl).toFixed(2)),
    ctr: parseFloat(j(base.ctr).toFixed(5)),
    cpc: parseFloat(j(base.cpc).toFixed(3)),
    roas: parseFloat(j(base.roas).toFixed(3)),
    rawJson: JSON.stringify({ source: "seed-strategy" }),
  };
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n⏳ Populando dados de Análise Estratégica…\n");

  // Garante que empresa e credencial existem (criadas pelo seed.ts principal)
  const company = await prisma.company.findUnique({ where: { id: "company-tech" } });
  if (!company) {
    throw new Error(
      "Empresa company-tech não encontrada. Execute 'npx tsx prisma/seed.ts' primeiro.",
    );
  }

  let metaCred = await prisma.adPlatformCredential.findUnique({
    where: { companyId_platform: { companyId: "company-tech", platform: "meta" } },
  });
  if (!metaCred) {
    metaCred = await prisma.adPlatformCredential.create({
      data: {
        companyId: "company-tech",
        platform: "meta",
        encryptedData: JSON.stringify({ iv: "iv", tag: "tag", data: "data" }),
        isValid: true,
        validatedAt: daysAgo(5),
      },
    });
  }

  let googleCred = await prisma.adPlatformCredential.findUnique({
    where: { companyId_platform: { companyId: "company-tech", platform: "google" } },
  });
  if (!googleCred) {
    googleCred = await prisma.adPlatformCredential.create({
      data: {
        companyId: "company-tech",
        platform: "google",
        encryptedData: JSON.stringify({ iv: "iv-g", tag: "tag-g", data: "data-g" }),
        isValid: true,
        validatedAt: daysAgo(5),
      },
    });
  }

  // ── Limpa campanhas e métricas anteriores desta seed ─────────────────────
  const stratIds = [
    "strat-camp-ESTRELA",
    "strat-camp-PROMISSORA",
    "strat-camp-ALERTA-CTR",
    "strat-camp-ALERTA-ROAS",
    "strat-camp-ALERTA-CPC",
    "strat-camp-NOVA",
  ];

  await prisma.adMetricSnapshot.deleteMany({
    where: { campaignId: { in: stratIds } },
  });
  await prisma.abTest.deleteMany({ where: { campaignId: { in: stratIds } } });
  await prisma.automationRule.deleteMany({ where: { campaignId: { in: stratIds } } });
  await prisma.campaignAuditLog.deleteMany({ where: { campaignId: { in: stratIds } } });
  await prisma.adCampaign.deleteMany({ where: { id: { in: stratIds } } });

  // ══════════════════════════════════════════════════════════════════════════
  // CAMPANHA 1 — ESTRELA (Meta)
  // Classificação esperada: PONTO FORTE (CTR 5.2% > 3%)
  // ROAS médio: ~4.8x
  // CTR médio:  ~5.2%
  // CPC médio:  ~R$ 0.38
  // Orçamento:  R$ 150/dia
  // ══════════════════════════════════════════════════════════════════════════
  await prisma.adCampaign.create({
    data: {
      id: "strat-camp-ESTRELA",
      companyId: "company-tech",
      credentialId: metaCred.id,
      platform: "meta",
      campaignType: "social",
      name: "🌟 Geração de Leads Premium",
      objective: "lead_generation",
      dailyBudgetBrl: 150,
      status: "active",
      externalCampaignId: "meta-strat-001",
      externalAdSetId: "meta-adset-strat-001",
      launchedAt: daysAgo(29),
    },
  });

  const estrelaSnaps = Array.from({ length: 30 }, (_, i) =>
    snap("strat-camp-ESTRELA", 29 - i, {
      impressions: 9_500,
      clicks: 494,       // CTR ≈ 5.2%
      conversions: 22,
      spendBrl: 148,
      ctr: 0.052,
      cpc: 0.38,
      roas: 4.8,
    }),
  );
  await prisma.adMetricSnapshot.createMany({ data: estrelaSnaps });

  // ══════════════════════════════════════════════════════════════════════════
  // CAMPANHA 2 — PROMISSORA (Google)
  // Classificação esperada: PONTO FORTE (CTR 4.1% > 3%)
  // ROAS moderado mas CTR excelente — ótimo para reconhecimento de marca
  // ROAS médio: ~2.1x
  // CTR médio:  ~4.1%
  // CPC médio:  ~R$ 0.61
  // Orçamento:  R$ 200/dia
  // ══════════════════════════════════════════════════════════════════════════
  await prisma.adCampaign.create({
    data: {
      id: "strat-camp-PROMISSORA",
      companyId: "company-tech",
      credentialId: googleCred.id,
      platform: "google",
      campaignType: "search",
      name: "📈 Busca Branded - Consultoria TI",
      objective: "brand_awareness",
      dailyBudgetBrl: 200,
      status: "active",
      externalCampaignId: "google-strat-001",
      launchedAt: daysAgo(27),
    },
  });

  const promissoraSnaps = Array.from({ length: 28 }, (_, i) =>
    snap("strat-camp-PROMISSORA", 27 - i, {
      impressions: 5_200,
      clicks: 213,       // CTR ≈ 4.1%
      conversions: 9,
      spendBrl: 198,
      ctr: 0.041,
      cpc: 0.61,
      roas: 2.1,
    }),
  );
  await prisma.adMetricSnapshot.createMany({ data: promissoraSnaps });

  // ══════════════════════════════════════════════════════════════════════════
  // CAMPANHA 3 — ALERTA: CTR BAIXO (Meta)
  // Classificação esperada: ALERTA (CTR 0.5% < 1%)
  // Muita impressão, pouquíssimo clique — criativo ineficiente
  // ROAS médio: ~1.8x (acima de 1.5 mas CTR é o problema)
  // CTR médio:  ~0.5%
  // CPC médio:  ~R$ 1.20
  // Orçamento:  R$ 80/dia
  // ══════════════════════════════════════════════════════════════════════════
  await prisma.adCampaign.create({
    data: {
      id: "strat-camp-ALERTA-CTR",
      companyId: "company-tech",
      credentialId: metaCred.id,
      platform: "meta",
      campaignType: "display",
      name: "⚠️ Display Awareness - Baixo CTR",
      objective: "reach",
      dailyBudgetBrl: 80,
      status: "active",
      externalCampaignId: "meta-strat-002",
      externalAdSetId: "meta-adset-strat-002",
      launchedAt: daysAgo(25),
    },
  });

  const alertaCtrSnaps = Array.from({ length: 26 }, (_, i) =>
    snap("strat-camp-ALERTA-CTR", 25 - i, {
      impressions: 15_000,
      clicks: 75,        // CTR ≈ 0.5%
      conversions: 3,
      spendBrl: 78,
      ctr: 0.005,
      cpc: 1.20,
      roas: 1.8,
    }),
  );
  await prisma.adMetricSnapshot.createMany({ data: alertaCtrSnaps });

  // ══════════════════════════════════════════════════════════════════════════
  // CAMPANHA 4 — ALERTA: ROAS BAIXO (Meta)
  // Classificação esperada: ALERTA (ROAS 0.9x < 1.5)
  // Gastando mais do que está gerando — campanha no negativo
  // ROAS médio: ~0.9x
  // CTR médio:  ~1.8% (ok, problema é conversão)
  // CPC médio:  ~R$ 0.85
  // Orçamento:  R$ 100/dia
  // ══════════════════════════════════════════════════════════════════════════
  await prisma.adCampaign.create({
    data: {
      id: "strat-camp-ALERTA-ROAS",
      companyId: "company-tech",
      credentialId: metaCred.id,
      platform: "meta",
      campaignType: "social",
      name: "⚠️ Remarketing - ROAS Negativo",
      objective: "conversions",
      dailyBudgetBrl: 100,
      status: "active",
      externalCampaignId: "meta-strat-003",
      externalAdSetId: "meta-adset-strat-003",
      launchedAt: daysAgo(22),
    },
  });

  const alertaRoasSnaps = Array.from({ length: 23 }, (_, i) =>
    snap("strat-camp-ALERTA-ROAS", 22 - i, {
      impressions: 6_500,
      clicks: 117,       // CTR ≈ 1.8%
      conversions: 2,    // Baixo — problema de landing page / oferta
      spendBrl: 98,
      ctr: 0.018,
      cpc: 0.85,
      roas: 0.9,         // < 1.5 → ALERTA
    }),
  );
  await prisma.adMetricSnapshot.createMany({ data: alertaRoasSnaps });

  // ══════════════════════════════════════════════════════════════════════════
  // CAMPANHA 5 — ALERTA: CPC MUITO ALTO (Google)
  // Classificação esperada: ALERTA (CPC > 2× média do portfólio)
  // Palavra-chave muito competitiva — custo alto por clique
  // portfolioAvgCpc estimado: ~R$ 0.71 → 2× = R$ 1.42
  // CPC desta campanha: ~R$ 3.80 (muito acima)
  // ROAS médio: ~3.5x (ok) mas custo inviabiliza escala
  // Orçamento:  R$ 250/dia
  // ══════════════════════════════════════════════════════════════════════════
  await prisma.adCampaign.create({
    data: {
      id: "strat-camp-ALERTA-CPC",
      companyId: "company-tech",
      credentialId: googleCred.id,
      platform: "google",
      campaignType: "search",
      name: "⚠️ Busca Competitiva - CPC Alto",
      objective: "lead_generation",
      dailyBudgetBrl: 250,
      status: "active",
      externalCampaignId: "google-strat-002",
      launchedAt: daysAgo(20),
    },
  });

  const alertaCpcSnaps = Array.from({ length: 21 }, (_, i) =>
    snap("strat-camp-ALERTA-CPC", 20 - i, {
      impressions: 1_200,
      clicks: 58,        // CTR ≈ 4.8% (bom) mas CPC é caro
      conversions: 8,
      spendBrl: 248,
      ctr: 0.048,
      cpc: 3.80,         // > 2× média do portfólio → ALERTA
      roas: 3.5,
    }),
  );
  await prisma.adMetricSnapshot.createMany({ data: alertaCpcSnaps });

  // ══════════════════════════════════════════════════════════════════════════
  // CAMPANHA 6 — NOVA (Google) — apenas 3 dias de dados
  // Comportamento esperado: EXCLUÍDA da análise (< 7 dias)
  // O serviço NÃO deve incluir esta campanha no diagnóstico
  // ══════════════════════════════════════════════════════════════════════════
  await prisma.adCampaign.create({
    data: {
      id: "strat-camp-NOVA",
      companyId: "company-tech",
      credentialId: googleCred.id,
      platform: "google",
      campaignType: "search",
      name: "🆕 Nova Campanha (dados insuficientes)",
      objective: "lead_generation",
      dailyBudgetBrl: 80,
      status: "active",
      externalCampaignId: "google-strat-003",
      launchedAt: daysAgo(3),
    },
  });

  // Apenas 3 dias de dados — abaixo do mínimo de 7
  await prisma.adMetricSnapshot.createMany({
    data: [
      snap("strat-camp-NOVA", 2, { impressions: 500, clicks: 20, conversions: 1, spendBrl: 75, ctr: 0.04, cpc: 0.55, roas: 2.8 }),
      snap("strat-camp-NOVA", 1, { impressions: 520, clicks: 22, conversions: 2, spendBrl: 78, ctr: 0.042, cpc: 0.52, roas: 3.2 }),
      snap("strat-camp-NOVA", 0, { impressions: 480, clicks: 18, conversions: 1, spendBrl: 77, ctr: 0.038, cpc: 0.58, roas: 2.6 }),
    ],
  });

  // ── Regras de automação específicas para estes cenários ──────────────────
  // Só recria se não existirem já
  const existingRules = await prisma.automationRule.findMany({
    where: { companyId: "company-tech", campaignId: { in: stratIds } },
  });
  if (existingRules.length === 0) {
    await prisma.automationRule.createMany({
      data: [
        {
          companyId: "company-tech",
          campaignId: "strat-camp-ALERTA-CTR",
          name: "Pausar quando CTR < 0.5%",
          isActive: true,
          conditionJson: JSON.stringify({ metric: "ctr", operator: "lt", value: 0.005 }),
          actionJson: JSON.stringify({ type: "pause_ad" }),
        },
        {
          companyId: "company-tech",
          campaignId: "strat-camp-ALERTA-ROAS",
          name: "Reduzir orçamento quando ROAS < 1.0",
          isActive: true,
          conditionJson: JSON.stringify({ metric: "roas", operator: "lt", value: 1.0 }),
          actionJson: JSON.stringify({ type: "increase_budget", budgetIncreasePercent: -30 }),
        },
        {
          companyId: "company-tech",
          campaignId: "strat-camp-ESTRELA",
          name: "Aumentar orçamento quando ROAS > 5.0",
          isActive: true,
          conditionJson: JSON.stringify({ metric: "roas", operator: "gt", value: 5.0 }),
          actionJson: JSON.stringify({ type: "increase_budget", budgetIncreasePercent: 25 }),
        },
      ],
    });
  }

  // ── Relatório de diagnóstico esperado ────────────────────────────────────

  // Calcula métricas resumidas para o relatório
  const allCampaigns = [
    { name: "🌟 Geração de Leads Premium",    roas: 4.8,  ctr: 5.2, cpc: 0.38, status: "PONTO FORTE: CTR > 3%" },
    { name: "📈 Busca Branded - Consultoria", roas: 2.1,  ctr: 4.1, cpc: 0.61, status: "PONTO FORTE: CTR > 3%" },
    { name: "⚠️ Display Awareness",           roas: 1.8,  ctr: 0.5, cpc: 1.20, status: "ALERTA: CTR < 1%" },
    { name: "⚠️ Remarketing",                  roas: 0.9,  ctr: 1.8, cpc: 0.85, status: "ALERTA: ROAS < 1.5" },
    { name: "⚠️ Busca Competitiva",            roas: 3.5,  ctr: 4.8, cpc: 3.80, status: "ALERTA: CPC > 2× média (~R$1.42)" },
    { name: "🆕 Nova Campanha",               roas: 2.9,  ctr: 4.0, cpc: 0.55, status: "EXCLUÍDA: apenas 3 dias" },
  ];

  const qualifying = allCampaigns.slice(0, 5);
  const portfolioRoas = qualifying.reduce((s, c) => s + c.roas, 0) / qualifying.length;
  const portfolioCpc  = qualifying.reduce((s, c) => s + c.cpc,  0) / qualifying.length;

  console.log("\n✅ Dados de Análise Estratégica criados!\n");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  EMPRESA: Tech Solutions Brasil");
  console.log("  LOGIN:   demo@mktdigital.com / demo123");
  console.log("  ROTA:    Tráfego Pago → Ferramentas → Análise Estratégica");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`\n  PORTFÓLIO:  ROAS médio = ${portfolioRoas.toFixed(2)}x  |  CPC médio = R$ ${portfolioCpc.toFixed(2)}`);
  console.log(`  threshold pontos fortes: ROAS > ${(portfolioRoas * 2).toFixed(2)}x  OU  CTR > 3%`);
  console.log(`  threshold alertas CPC:   CPC  > R$ ${(portfolioCpc * 2).toFixed(2)}\n`);
  console.log("  ┌─────────────────────────────────────────────┬──────────────────────────────────┐");
  console.log("  │ Campanha                                    │ Diagnóstico esperado             │");
  console.log("  ├─────────────────────────────────────────────┼──────────────────────────────────┤");
  for (const c of allCampaigns) {
    const name = c.name.padEnd(43);
    const status = c.status.padEnd(32);
    console.log(`  │ ${name} │ ${status} │`);
  }
  console.log("  └─────────────────────────────────────────────┴──────────────────────────────────┘");
  console.log("\n  MUDANÇAS DE ROTA que a IA deve sugerir:");
  console.log("    1. budget_adjustment → aumentar orçamento da Campanha ESTRELA");
  console.log("    2. pause_campaign    → pausar Campanha ALERTA-ROAS (prejuízo)");
  console.log("    3. new_audience      → testar público diferente na ALERTA-CTR");
  console.log("\n  COMO TESTAR:");
  console.log("    1. Faça login com demo@mktdigital.com");
  console.log("    2. Selecione 'Tech Solutions Brasil' como empresa ativa");
  console.log("    3. Acesse Tráfego Pago → Ferramentas → Análise Estratégica");
  console.log("    4. Clique em 'Gerar diagnóstico'");
  console.log("    5. Verifique: 2 pontos fortes, 3 alertas, 3 mudanças de rota");
  console.log("    6. Teste 'Aplicar mudança' em cada RouteChange:\n");
  console.log("       budget_adjustment → pede confirmação antes de executar");
  console.log("       pause_campaign    → pede confirmação antes de executar");
  console.log("       new_audience      → executa imediatamente (sem confirmação)");
  console.log("       editorial         → executa imediatamente (sem confirmação)");
  console.log("═══════════════════════════════════════════════════════════════\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
