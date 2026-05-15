/**
 * seed-mock-all-screens.mjs
 * Popula dados mockados para todas as telas de Tráfego Pago:
 *  - Regras de automação (com histórico de execuções)
 *  - Log de auditoria (várias entradas de vários tipos)
 *  - A/B tests ativos e finalizados
 *  - Mais snapshots de métricas para cobrir 30 dias
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

async function main() {
  const user = await prisma.user.findUnique({ where: { email: "demo@mktdigital.com" } });
  if (!user) throw new Error("Usuário demo não encontrado.");

  const company = await prisma.company.findUnique({ where: { userId: user.id } });
  if (!company) throw new Error("Empresa não encontrada.");

  console.log("Empresa:", company.name, "\n");

  // ── Busca as campanhas existentes ─────────────────────────────────────────
  const campaigns = await prisma.adCampaign.findMany({
    where: { companyId: company.id },
  });

  if (campaigns.length === 0) {
    console.log("❌ Nenhuma campanha encontrada. Rode seed-mock-campaigns.mjs primeiro.");
    return;
  }

  const [c1, c2, c3, c4, c5] = campaigns;
  console.log(`📋 ${campaigns.length} campanhas encontradas.`);

  // ── 1. REGRAS DE AUTOMAÇÃO ────────────────────────────────────────────────
  console.log("\n[1/4] Criando regras de automação...");

  const rules = [
    {
      companyId: company.id,
      campaignId: c1?.id ?? null,
      name: "Pausar anúncio se CPC > R$2,00",
      isActive: true,
      conditionJson: JSON.stringify({ metric: "cpc", operator: "gt", value: 2.0 }),
      actionJson: JSON.stringify({ type: "pause_ad" }),
    },
    {
      companyId: company.id,
      campaignId: c2?.id ?? null,
      name: "Aumentar orçamento se ROAS > 4",
      isActive: true,
      conditionJson: JSON.stringify({ metric: "roas", operator: "gt", value: 4.0 }),
      actionJson: JSON.stringify({ type: "increase_budget", budgetIncreasePercent: 20 }),
    },
    {
      companyId: company.id,
      campaignId: null,
      name: "Pausar Ad Set se CTR < 1%",
      isActive: true,
      conditionJson: JSON.stringify({ metric: "ctr", operator: "lt", value: 0.01 }),
      actionJson: JSON.stringify({ type: "pause_adset" }),
    },
    {
      companyId: company.id,
      campaignId: c3?.id ?? null,
      name: "Substituir criativo se conversões < 5",
      isActive: false,
      conditionJson: JSON.stringify({ metric: "conversions", operator: "lt", value: 5 }),
      actionJson: JSON.stringify({ type: "replace_creative" }),
    },
    {
      companyId: company.id,
      campaignId: c5?.id ?? null,
      name: "Aumentar orçamento se custo < R$100",
      isActive: true,
      conditionJson: JSON.stringify({ metric: "totalCost", operator: "lt", value: 100 }),
      actionJson: JSON.stringify({ type: "increase_budget", budgetIncreasePercent: 15 }),
    },
  ];

  const createdRules = [];
  for (const rule of rules) {
    const existing = await prisma.automationRule.findFirst({
      where: { companyId: company.id, name: rule.name },
    });
    if (existing) {
      createdRules.push(existing);
      console.log(`  ⏭  Regra já existe: ${rule.name}`);
    } else {
      const r = await prisma.automationRule.create({ data: rule });
      createdRules.push(r);
      console.log(`  ✅ Regra criada: ${rule.name}`);
    }
  }

  // Histórico de execuções das regras
  console.log("   Criando histórico de execuções...");
  const executions = [
    { ruleId: createdRules[0]?.id, campaignId: c1?.id, triggered: true, outcome: "executed", executedAt: daysAgo(1) },
    { ruleId: createdRules[0]?.id, campaignId: c1?.id, triggered: true, outcome: "executed", executedAt: daysAgo(3) },
    { ruleId: createdRules[0]?.id, campaignId: c1?.id, triggered: false, outcome: "skipped", executedAt: daysAgo(5) },
    { ruleId: createdRules[1]?.id, campaignId: c2?.id, triggered: true, outcome: "executed", executedAt: daysAgo(2) },
    { ruleId: createdRules[1]?.id, campaignId: c2?.id, triggered: true, outcome: "pending_confirmation", executedAt: daysAgo(4) },
    { ruleId: createdRules[2]?.id, campaignId: c4?.id, triggered: true, outcome: "executed", executedAt: daysAgo(1) },
    { ruleId: createdRules[2]?.id, campaignId: c3?.id, triggered: false, outcome: "skipped", executedAt: daysAgo(2) },
    { ruleId: createdRules[4]?.id, campaignId: c5?.id, triggered: true, outcome: "executed", executedAt: daysAgo(1) },
  ];

  let execCount = 0;
  for (const exec of executions) {
    if (!exec.ruleId || !exec.campaignId) continue;
    await prisma.ruleExecutionLog.create({
      data: {
        ruleId: exec.ruleId,
        campaignId: exec.campaignId,
        triggered: exec.triggered,
        outcome: exec.outcome,
        executedAt: exec.executedAt,
        apiResponse: exec.triggered ? JSON.stringify({ status: "ok", mock: true }) : null,
      },
    });
    execCount++;
  }
  console.log(`   ✅ ${execCount} execuções registradas`);

  // ── 2. LOG DE AUDITORIA ───────────────────────────────────────────────────
  console.log("\n[2/4] Criando log de auditoria...");

  const auditEntries = [
    // Campanhas criadas
    ...campaigns.map((c, i) => ({
      companyId: company.id,
      campaignId: c.id,
      actionType: "campaign_created",
      source: "user",
      newValues: JSON.stringify({ platform: c.platform, externalCampaignId: c.externalCampaignId }),
      createdAt: daysAgo(20 - i * 3),
    })),
    // Ajustes de orçamento automáticos
    {
      companyId: company.id,
      campaignId: c1?.id,
      actionType: "budget_updated",
      source: "budget_manager",
      previousValues: JSON.stringify({ dailyBudgetBrl: 150 }),
      newValues: JSON.stringify({ dailyBudgetBrl: 180 }),
      requiresConfirmation: false,
      createdAt: daysAgo(5),
    },
    {
      companyId: company.id,
      campaignId: c2?.id,
      actionType: "budget_updated",
      source: "budget_manager",
      previousValues: JSON.stringify({ dailyBudgetBrl: 80 }),
      newValues: JSON.stringify({ dailyBudgetBrl: 96 }),
      requiresConfirmation: false,
      userDecision: null,
      createdAt: daysAgo(4),
    },
    // Orçamento acima do threshold — aguardando confirmação
    {
      companyId: company.id,
      campaignId: c3?.id,
      actionType: "budget_updated",
      source: "budget_manager",
      previousValues: JSON.stringify({ dailyBudgetBrl: 200 }),
      newValues: JSON.stringify({ dailyBudgetBrl: 600 }),
      requiresConfirmation: true,
      userDecision: null,
      createdAt: daysAgo(2),
    },
    // Orçamento confirmado pelo usuário
    {
      companyId: company.id,
      campaignId: c3?.id,
      actionType: "budget_updated",
      source: "budget_manager",
      previousValues: JSON.stringify({ dailyBudgetBrl: 200 }),
      newValues: JSON.stringify({ dailyBudgetBrl: 550 }),
      requiresConfirmation: true,
      userDecision: "approved",
      userDecisionAt: daysAgo(1),
      createdAt: daysAgo(3),
    },
    // Pausa automática de anúncio por regra
    {
      companyId: company.id,
      campaignId: c4?.id,
      actionType: "ad_paused",
      source: "rule_engine",
      previousValues: JSON.stringify({ status: "ACTIVE" }),
      newValues: JSON.stringify({ status: "PAUSED", reason: "CTR < 1% (0.005)" }),
      requiresConfirmation: false,
      createdAt: daysAgo(1),
    },
    // Substituição de criativo solicitada
    {
      companyId: company.id,
      campaignId: c4?.id,
      actionType: "creative_replacement_requested",
      source: "rule_engine",
      metadata: JSON.stringify({ message: "Criativo com baixa performance. Envie um novo criativo para aprovação." }),
      requiresConfirmation: true,
      userDecision: "rejected",
      userDecisionAt: daysAgo(0),
      createdAt: daysAgo(1),
    },
    // Relatório de performance gerado
    {
      companyId: company.id,
      campaignId: null,
      actionType: "performance_report_generated",
      source: "performance_monitor",
      newValues: JSON.stringify({ companiesProcessed: 1, snapshotsSaved: 5, reportsGenerated: 1 }),
      createdAt: daysAgo(0),
    },
    // A/B test encerrado
    {
      companyId: company.id,
      campaignId: c2?.id,
      actionType: "ab_test_completed",
      source: "ab_test",
      newValues: JSON.stringify({ winnerAdId: "mock-meta-ad-003-v2", winnerCtr: 0.072 }),
      createdAt: daysAgo(7),
    },
  ];

  let auditCount = 0;
  for (const entry of auditEntries) {
    await prisma.campaignAuditLog.create({ data: entry }).catch(() => {}); // ignore duplicates
    auditCount++;
  }
  console.log(`  ✅ ${auditCount} entradas de auditoria criadas`);

  // ── 3. A/B TESTS ──────────────────────────────────────────────────────────
  console.log("\n[3/4] Criando testes A/B...");

  const abTests = [
    // Teste ativo na campanha de conversão
    {
      campaignId: c2?.id,
      status: "active",
      startedAt: daysAgo(2),
      extensionCount: 0,
      variationsJson: JSON.stringify([
        {
          externalAdId: "mock-meta-ad-003-v1",
          variationIndex: 1,
          creative: { headline: "Workshop Gratuito: Transforme sua empresa", description: "Aprenda como digitalizar sua empresa em 30 dias", callToAction: "Inscreva-se agora" },
          impressions: 1850,
          clicks: 92,
          ctr: 0.050,
          isWinner: false,
        },
        {
          externalAdId: "mock-meta-ad-003-v2",
          variationIndex: 2,
          creative: { headline: "Só 20 vagas! Workshop de Transformação Digital", description: "Resultados comprovados em mais de 50 PMEs", callToAction: "Garantir minha vaga" },
          impressions: 1920,
          clicks: 138,
          ctr: 0.072,
          isWinner: false,
        },
        {
          externalAdId: "mock-meta-ad-003-v3",
          variationIndex: 3,
          creative: { headline: "Sua empresa na era digital", description: "Workshop online e gratuito — próxima quinta", callToAction: "Quero participar" },
          impressions: 1780,
          clicks: 89,
          ctr: 0.050,
          isWinner: false,
        },
      ]),
    },
    // Teste concluído na campanha de Search
    {
      campaignId: c3?.id,
      status: "completed",
      startedAt: daysAgo(12),
      endedAt: daysAgo(7),
      winnerAdId: "mock-google-ad-001",
      extensionCount: 1,
      resultSummary: "Teste concluído. Variação 1 venceu com CTR de 9,8%, superando variações 2 (8,4%) e 3 (7,1%). Headline foco em benefício direto performou melhor.",
      variationsJson: JSON.stringify([
        {
          externalAdId: "mock-google-ad-001",
          variationIndex: 1,
          creative: { headline: "Consultoria TI para PMEs — Resultados em 60 dias", description: "Reduza custos e aumente a produtividade da sua equipe", callToAction: "Solicitar proposta" },
          impressions: 1450,
          clicks: 142,
          ctr: 0.098,
          isWinner: true,
        },
        {
          externalAdId: "mock-google-ad-002",
          variationIndex: 2,
          creative: { headline: "Transformação Digital para Empresas", description: "Consultoria especializada em tecnologia e automação", callToAction: "Saiba mais" },
          impressions: 1380,
          clicks: 116,
          ctr: 0.084,
          isWinner: false,
        },
        {
          externalAdId: "mock-google-ad-003",
          variationIndex: 3,
          creative: { headline: "Especialistas em TI Corporativo", description: "Mais de 10 anos de experiência com PMEs", callToAction: "Fale com um consultor" },
          impressions: 1290,
          clicks: 92,
          ctr: 0.071,
          isWinner: false,
        },
      ]),
    },
  ];

  let abCount = 0;
  for (const test of abTests) {
    if (!test.campaignId) continue;
    const existing = await prisma.abTest.findFirst({ where: { campaignId: test.campaignId } });
    if (!existing) {
      await prisma.abTest.create({ data: test });
      abCount++;
      console.log(`  ✅ A/B test criado para campanha ${test.campaignId.slice(-8)} [${test.status}]`);
    } else {
      console.log(`  ⏭  A/B test já existe para campanha ${test.campaignId.slice(-8)}`);
    }
  }

  // ── 4. MAIS SNAPSHOTS DE MÉTRICAS (para cobrir 30 dias nos gráficos) ──────
  console.log("\n[4/4] Completando snapshots de métricas para 30 dias...");

  const extraSnapshots = [];

  // Para cada campanha ativa, cobre os dias que não têm snapshot
  const activeCampaigns = campaigns.filter(c => c.status === "active");
  for (const camp of activeCampaigns) {
    // Gera snapshots diários dos dias 4 a 30
    for (let day = 4; day <= 30; day++) {
      const existingSnap = await prisma.adMetricSnapshot.findFirst({
        where: {
          campaignId: camp.id,
          collectedAt: {
            gte: new Date(daysAgo(day).getTime() - 12 * 3600000),
            lte: new Date(daysAgo(day).getTime() + 12 * 3600000),
          },
        },
      });
      if (existingSnap) continue;

      // Simula variação realista nas métricas
      const baseImp = camp.platform === "google" ? 4000 : 8000;
      const variance = 0.8 + Math.random() * 0.4; // ±20%
      const impressions = Math.round(baseImp * variance);
      const ctr = camp.campaignType === "search" ? 0.085 + (Math.random() - 0.5) * 0.02 : 0.045 + (Math.random() - 0.5) * 0.015;
      const clicks = Math.round(impressions * ctr);
      const convRate = 0.08 + Math.random() * 0.04;
      const conversions = Math.round(clicks * convRate);
      const spendBrl = camp.dailyBudgetBrl * (0.85 + Math.random() * 0.15);
      const cpc = clicks > 0 ? spendBrl / clicks : 0;
      const roas = spendBrl > 0 ? (conversions * (spendBrl / conversions * 3.5)) / spendBrl : 0;

      extraSnapshots.push({
        campaignId: camp.id,
        collectedAt: daysAgo(day),
        periodStart: new Date(daysAgo(day).getTime() - 6 * 3600000),
        periodEnd: daysAgo(day),
        impressions,
        clicks,
        conversions,
        spendBrl: Math.round(spendBrl * 100) / 100,
        ctr: Math.round(ctr * 10000) / 10000,
        cpc: Math.round(cpc * 100) / 100,
        roas: Math.round(roas * 100) / 100,
        rawJson: JSON.stringify({ mock: true, day }),
      });
    }
  }

  if (extraSnapshots.length > 0) {
    let insertedCount = 0;
    for (const snap of extraSnapshots) {
      try {
        await prisma.adMetricSnapshot.create({ data: snap });
        insertedCount++;
      } catch {
        // skip duplicates silently
      }
    }
    console.log(`  ✅ ${insertedCount} snapshots adicionais inseridos`);
  } else {
    console.log("  ⏭  Snapshots já existem para todos os dias");
  }

  // ── Resumo ─────────────────────────────────────────────────────────────────
  const totalRules = await prisma.automationRule.count({ where: { companyId: company.id } });
  const totalAudit = await prisma.campaignAuditLog.count({ where: { companyId: company.id } });
  const totalAb    = await prisma.abTest.count({ where: { campaign: { companyId: company.id } } });
  const totalSnap  = await prisma.adMetricSnapshot.count({ where: { campaign: { companyId: company.id } } });

  console.log("\n────────────────────────────────────────────────────────");
  console.log(`✅ Dados mockados prontos para validação:`);
  console.log(`   🎯 Campanhas:          ${campaigns.length}`);
  console.log(`   📐 Regras de automação: ${totalRules}`);
  console.log(`   📋 Log de auditoria:    ${totalAudit} entradas`);
  console.log(`   🧪 Testes A/B:          ${totalAb}`);
  console.log(`   📊 Snapshots métricas:  ${totalSnap}`);
  console.log("\nTelas para testar:");
  console.log("  /paid-traffic           → Dashboard com campanhas e métricas");
  console.log("  /paid-traffic/credentials → Status das credenciais");
  console.log("  /paid-traffic/new       → Wizard de nova campanha");
  console.log("  /paid-traffic/rules     → Regras de automação");
  console.log("  /paid-traffic/budget    → Inteligência de orçamento (chama IA)");
  console.log("  /paid-traffic/audit     → Log de auditoria completo");
}

main().catch(console.error).finally(() => prisma.$disconnect());
