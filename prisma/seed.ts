/**
 * seed.ts — dados mockados abrangentes para a plataforma MKT Digital
 *
 * Usuários criados:
 *   demo@mktdigital.com / demo123        → 3 empresas (Tech, Moda, Gastronomia)
 *   agencia@mktdigital.com / demo123     → 1 empresa (Agência)
 *
 * Cobre todos os módulos para testes manuais e automatizados:
 *   - Criação de conteúdo (post, carrossel, reel, story)
 *   - Feed Grid Planner (posts publicados + agendados + rascunhos)
 *   - Post Boost (posts com sugestão e campanha vinculada)
 *   - Tráfego Pago (campanhas Meta + Google, métricas 30 dias, A/B tests)
 *   - Análise Estratégica (RouteChanges, dados insuficientes vs suficientes)
 *   - Regras de Automação + logs de execução
 *   - Bio Generator / Profile Auditor / Feed Grid
 *   - Custos (texto + imagem, vários modelos)
 *   - VideoJobs (varios estados do pipeline)
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** d dias atrás */
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000);
/** d dias no futuro */
const daysAhead = (d: number) => new Date(Date.now() + d * 86_400_000);
/** horas atrás */
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);

// Placeholder de imagem por cor
const img = (color: string, label: string, w = 1080, h = 1080) =>
  `https://placehold.co/${w}x${h}/${color}/FFFFFF?text=${encodeURIComponent(label)}`;

// ─────────────────────────────────────────────────────────────────────────────
// Seed principal
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const hashedPw = await bcrypt.hash("demo123", 12);

  // ── Planos ────────────────────────────────────────────────────────────────
  const planBasico = await prisma.plan.upsert({
    where: { id: "plan-basico" },
    update: {},
    create: {
      id: "plan-basico",
      name: "Básico",
      priceMonthlyUsd: 49,
      priceYearlyUsd: 490,
      aiImageCreditsPerMonth: 50,
      aiTextCreditsPerMonth: 200,
      isActive: true,
    },
  });

  const planPro = await prisma.plan.upsert({
    where: { id: "plan-pro" },
    update: {},
    create: {
      id: "plan-pro",
      name: "Pro",
      priceMonthlyUsd: 149,
      priceYearlyUsd: 1490,
      aiImageCreditsPerMonth: 300,
      aiTextCreditsPerMonth: 1000,
      isActive: true,
    },
  });

  const planAgencia = await prisma.plan.upsert({
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

  // ── Usuário principal (demo) ───────────────────────────────────────────────
  const userDemo = await prisma.user.upsert({
    where: { email: "demo@mktdigital.com" },
    update: {},
    create: {
      name: "Usuário Demo",
      email: "demo@mktdigital.com",
      password: hashedPw,
    },
  });

  await prisma.subscription.upsert({
    where: { userId: userDemo.id },
    update: { planId: planAgencia.id, status: "active" },
    create: {
      userId: userDemo.id,
      planId: planAgencia.id,
      status: "active",
      currentPeriodStart: daysAgo(15),
      currentPeriodEnd: daysAhead(345),
      paymentProvider: "demo",
    },
  });

  // ── Usuário agência ────────────────────────────────────────────────────────
  const userAgencia = await prisma.user.upsert({
    where: { email: "agencia@mktdigital.com" },
    update: {},
    create: {
      name: "Gestora de Conteúdo",
      email: "agencia@mktdigital.com",
      password: hashedPw,
    },
  });

  await prisma.subscription.upsert({
    where: { userId: userAgencia.id },
    update: { planId: planPro.id, status: "active" },
    create: {
      userId: userAgencia.id,
      planId: planPro.id,
      status: "active",
      currentPeriodStart: daysAgo(5),
      currentPeriodEnd: daysAhead(25),
      paymentProvider: "demo",
    },
  });

  // ── Usuário em trial ────────────────────────────────────────────────────────
  const userTrial = await prisma.user.upsert({
    where: { email: "trial@mktdigital.com" },
    update: {},
    create: {
      name: "Novo Usuário Trial",
      email: "trial@mktdigital.com",
      password: hashedPw,
    },
  });

  await prisma.subscription.upsert({
    where: { userId: userTrial.id },
    update: { planId: planBasico.id, status: "trialing" },
    create: {
      userId: userTrial.id,
      planId: planBasico.id,
      status: "trialing",
      currentPeriodStart: daysAgo(3),
      currentPeriodEnd: daysAhead(11),
      paymentProvider: "demo",
    },
  });

  // ══════════════════════════════════════════════════════════════════════════
  // EMPRESA 1 — Tech Solutions Brasil (userDemo)
  // Foco: tráfego pago robusto, todas as funcionalidades
  // ══════════════════════════════════════════════════════════════════════════

  const techCompany = await prisma.company.upsert({
    where: { id: "company-tech" },
    update: {},
    create: {
      id: "company-tech",
      userId: userDemo.id,
      name: "Tech Solutions Brasil",
      description: "Consultoria em tecnologia e transformação digital para PMEs brasileiras",
      sector: "Tecnologia",
      objective: "Gerar leads qualificados e fortalecer autoridade no mercado de TI",
      tone: "professional",
      colors: JSON.stringify(["#3B82F6", "#1E40AF", "#F8FAFC"]),
      logoUrl: img("3B82F6", "TSB", 200, 200),
    },
  });

  // Social accounts
  await prisma.socialAccount.upsert({
    where: { companyId_platform: { companyId: techCompany.id, platform: "instagram" } },
    update: {},
    create: {
      companyId: techCompany.id, platform: "instagram",
      profileName: "@techsolutions.br", connected: true,
      accessToken: "demo-ig-token", profileId: "tech-ig-profile",
    },
  });
  await prisma.socialAccount.upsert({
    where: { companyId_platform: { companyId: techCompany.id, platform: "linkedin" } },
    update: {},
    create: {
      companyId: techCompany.id, platform: "linkedin",
      profileName: "Tech Solutions Brasil", connected: true,
      accessToken: "demo-li-token", profileId: "tech-li-profile",
    },
  });
  await prisma.socialAccount.upsert({
    where: { companyId_platform: { companyId: techCompany.id, platform: "facebook" } },
    update: {},
    create: {
      companyId: techCompany.id, platform: "facebook",
      profileName: "Tech Solutions BR", connected: false,
    },
  });

  // ── Posts — Tech (todos os formatos e status) ─────────────────────────────
  // 1. Post padrão publicado (feed grid: posição fixa)
  const techPost1 = await prisma.post.create({
    data: {
      companyId: techCompany.id,
      platform: "instagram",
      format: "post",
      content: "Transformação digital não é sobre tecnologia — é sobre pessoas. Sua equipe está pronta para o próximo nível? 🚀\n\n#TransformaçãoDigital #Tecnologia #Inovação",
      imageUrl: img("3B82F6", "Tech+Post+1"),
      status: "published",
      publishedAt: daysAgo(15),
      gridOrder: null,
    },
  });
  // 2. Post padrão publicado
  const techPost2 = await prisma.post.create({
    data: {
      companyId: techCompany.id,
      platform: "instagram",
      format: "post",
      content: "5 sinais de que sua empresa precisa de consultoria em TI:\n\n✅ Processos manuais lentos\n✅ Dados descentralizados\n✅ Falta de visibilidade\n✅ Equipe sobrecarregada\n✅ Concorrentes evoluindo mais rápido\n\n#Consultoria #TI #PME",
      imageUrl: img("1E40AF", "Tech+Post+2"),
      status: "published",
      publishedAt: daysAgo(10),
      gridOrder: null,
    },
  });
  // 3. Post publicado com boost
  const techPost3 = await prisma.post.create({
    data: {
      companyId: techCompany.id,
      platform: "instagram",
      format: "post",
      content: "Case de sucesso: reduzimos 40% do custo operacional de uma distribuidora em 90 dias. Como? Automação inteligente de processos. 💡\n\n#CaseDeSuccesso #ROI #Automação",
      imageUrl: img("0EA5E9", "Case+Sucesso"),
      status: "published",
      publishedAt: daysAgo(5),
      gridOrder: null,
      boostSuggestionJson: JSON.stringify({
        objective: "Aumentar alcance",
        targetAudience: "Gestores e empresários 30-55, interesse em tecnologia e negócios",
        dailyBudgetBrl: 80,
        durationDays: 7,
        rationale: "Post com alta performance orgânica. Turbinar ampliará o alcance para tomadores de decisão.",
      }),
    },
  });
  // 4. Carrossel publicado
  const carouselSlides = JSON.stringify([
    { id: "slide-0", imageUrl: img("3B82F6", "Slide+1%3A+Problema"), headline: "Sua empresa ainda usa planilhas?", order: 0 },
    { id: "slide-1", imageUrl: img("2563EB", "Slide+2%3A+Causa"), headline: "O custo oculto dos processos manuais", order: 1 },
    { id: "slide-2", imageUrl: img("1D4ED8", "Slide+3%3A+Solução"), headline: "Automatize em menos de 30 dias", order: 2 },
    { id: "slide-3", imageUrl: img("1E40AF", "Slide+4%3A+Resultado"), headline: "Resultado: -40% tempo operacional", order: 3 },
    { id: "slide-4", imageUrl: img("0F3460", "Slide+5%3A+CTA"), headline: "Fale com nosso especialista hoje", order: 4 },
  ]);
  const techCarousel = await prisma.post.create({
    data: {
      companyId: techCompany.id,
      platform: "instagram",
      format: "carousel",
      content: "5 passos para automatizar sua empresa sem complicação. Deslize para descobrir →",
      status: "published",
      publishedAt: daysAgo(3),
      slidesJson: carouselSlides,
      gridOrder: null,
    },
  });
  // 5. Story publicado
  await prisma.post.create({
    data: {
      companyId: techCompany.id,
      platform: "instagram",
      format: "story",
      content: "Você sabia que 78% das PMEs perdem 20h/semana com tarefas manuais? 😱 Swipe up para saber como resolver isso!",
      imageUrl: img("6D28D9", "Story+Quiz", 1080, 1920),
      status: "published",
      publishedAt: daysAgo(1),
      gridOrder: null,
    },
  });
  // 6. Reel publicado
  await prisma.post.create({
    data: {
      companyId: techCompany.id,
      platform: "instagram",
      format: "reel",
      content: "Veja como automatizamos o estoque de uma loja em 48h ⚡ #Automação #Tecnologia #PME #TransformaçãoDigital #Startups",
      imageUrl: "https://example.com/reel-tech-preview.mp4",
      status: "published",
      publishedAt: daysAgo(2),
      gridOrder: null,
    },
  });
  // 7. Post agendado (feed grid: próximo a ser publicado)
  const techScheduled1 = await prisma.post.create({
    data: {
      companyId: techCompany.id,
      platform: "instagram",
      format: "post",
      content: "Workshop gratuito: Primeiros passos na transformação digital 🎓\n\nData: Próxima quinta-feira, 19h\nLink na bio!\n\n#Workshop #Gratuito #Tecnologia",
      imageUrl: img("10B981", "Workshop"),
      status: "scheduled",
      scheduledAt: daysAhead(2),
      gridOrder: 0,
    },
  });
  // 8. Carrossel agendado
  const techScheduled2 = await prisma.post.create({
    data: {
      companyId: techCompany.id,
      platform: "instagram",
      format: "carousel",
      content: "Os 7 pecados capitais da segurança digital nas PMEs. Você comete algum? →",
      status: "scheduled",
      scheduledAt: daysAhead(4),
      gridOrder: 1,
      slidesJson: JSON.stringify([
        { id: "s0", imageUrl: img("EF4444", "Pecado+1%3A+Senhas+Fracas"), headline: "Senhas fracas e repetidas", order: 0 },
        { id: "s1", imageUrl: img("DC2626", "Pecado+2%3A+Backup"), headline: "Falta de backup automático", order: 1 },
        { id: "s2", imageUrl: img("B91C1C", "Pecado+3%3A+Updates"), headline: "Sistemas sem atualização", order: 2 },
        { id: "s3", imageUrl: img("991B1B", "Pecado+4%3A+Acesso"), headline: "Acesso irrestrito de colaboradores", order: 3 },
        { id: "s4", imageUrl: img("7F1D1D", "Pecado+5%3A+2FA"), headline: "Sem autenticação 2 fatores", order: 4 },
        { id: "s5", imageUrl: img("6B0000", "Pecado+6%3A+Phishing"), headline: "Equipe sem treinamento anti-phishing", order: 5 },
        { id: "s6", imageUrl: img("4C0000", "Pecado+7%3A+Plano"), headline: "Sem plano de resposta a incidentes", order: 6 },
      ]),
    },
  });
  // 9. Story agendado (dentro de 24h — válido)
  await prisma.post.create({
    data: {
      companyId: techCompany.id,
      platform: "instagram",
      format: "story",
      content: "Enquete: Qual o maior desafio de TI na sua empresa? 📊",
      imageUrl: img("7C3AED", "Story+Enquete", 1080, 1920),
      status: "scheduled",
      scheduledAt: hoursAgo(-20), // 20h no futuro
      gridOrder: 2,
    },
  });
  // 10. Reel rascunho
  await prisma.post.create({
    data: {
      companyId: techCompany.id,
      platform: "instagram",
      format: "reel",
      content: "Bastidores: como nosso time resolve um problema de integração de dados em tempo real 🔧",
      status: "draft",
      gridOrder: 3,
    },
  });
  // 11. Post rascunho para LinkedIn
  await prisma.post.create({
    data: {
      companyId: techCompany.id,
      platform: "linkedin",
      format: "post",
      content: "Reflexão de segunda-feira: digitalização não é um projeto, é uma jornada contínua. O que a sua empresa fez esta semana para avançar?",
      status: "draft",
    },
  });
  // 12. Post com variantes
  const techPostWithVariants = await prisma.post.create({
    data: {
      companyId: techCompany.id,
      platform: "facebook",
      format: "post",
      content: "Consultoria gratuita de diagnóstico digital — saiba onde sua empresa está e onde pode chegar. Agende agora!",
      imageUrl: img("F59E0B", "Diagnóstico+Digital"),
      status: "draft",
    },
  });
  await prisma.postVariant.createMany({
    data: [
      { postId: techPostWithVariants.id, type: "text", content: "Opção A: Consultoria gratuita de diagnóstico digital — saiba onde sua empresa está e onde pode chegar.", selected: true },
      { postId: techPostWithVariants.id, type: "text", content: "Opção B: Descubra em 1 hora os gargalos que estão custando dinheiro à sua empresa. Diagnóstico digital gratuito." },
      { postId: techPostWithVariants.id, type: "text", content: "Opção C: Sua empresa está no nível certo de maturidade digital? Faça o diagnóstico gratuito e descubra." },
      { postId: techPostWithVariants.id, type: "image", mediaUrl: img("F59E0B", "Diagnóstico+A"), selected: true },
      { postId: techPostWithVariants.id, type: "image", mediaUrl: img("FBBF24", "Diagnóstico+B") },
      { postId: techPostWithVariants.id, type: "image", mediaUrl: img("FCD34D", "Diagnóstico+C") },
    ],
  });

  // ── Credenciais de anúncios — Tech ────────────────────────────────────────
  const techMetaCred = await prisma.adPlatformCredential.upsert({
    where: { companyId_platform: { companyId: techCompany.id, platform: "meta" } },
    update: {},
    create: {
      companyId: techCompany.id,
      platform: "meta",
      encryptedData: JSON.stringify({ iv: "demo-iv", tag: "demo-tag", data: "demo-encrypted" }),
      isValid: true,
      validatedAt: daysAgo(3),
    },
  });
  const techGoogleCred = await prisma.adPlatformCredential.upsert({
    where: { companyId_platform: { companyId: techCompany.id, platform: "google" } },
    update: {},
    create: {
      companyId: techCompany.id,
      platform: "google",
      encryptedData: JSON.stringify({ iv: "demo-iv-g", tag: "demo-tag-g", data: "demo-encrypted-g" }),
      isValid: true,
      validatedAt: daysAgo(5),
    },
  });

  // ── Campanhas de anúncio — Tech ───────────────────────────────────────────
  // Campanha 1: Meta ativa com bom desempenho (ROAS alto)
  const techCamp1 = await prisma.adCampaign.create({
    data: {
      id: "camp-tech-meta-leads",
      companyId: techCompany.id,
      credentialId: techMetaCred.id,
      platform: "meta",
      campaignType: "social",
      name: "Geração de Leads - Consultoria TI",
      objective: "lead_generation",
      dailyBudgetBrl: 120,
      status: "active",
      externalCampaignId: "meta-campaign-001",
      externalAdSetId: "meta-adset-001",
      externalAdIds: JSON.stringify(["meta-ad-001a", "meta-ad-001b"]),
      managerUrl: "https://business.facebook.com/adsmanager",
      launchedAt: daysAgo(30),
    },
  });

  // Campanha 2: Meta ativa com CTR baixo (alerta)
  const techCamp2 = await prisma.adCampaign.create({
    data: {
      id: "camp-tech-meta-awareness",
      companyId: techCompany.id,
      credentialId: techMetaCred.id,
      platform: "meta",
      campaignType: "display",
      name: "Awareness - Marca Tech Solutions",
      objective: "reach",
      dailyBudgetBrl: 60,
      status: "active",
      externalCampaignId: "meta-campaign-002",
      externalAdSetId: "meta-adset-002",
      launchedAt: daysAgo(25),
    },
  });

  // Campanha 3: Google Search ativa (boa performance)
  const techCamp3 = await prisma.adCampaign.create({
    data: {
      id: "camp-tech-google-search",
      companyId: techCompany.id,
      credentialId: techGoogleCred.id,
      platform: "google",
      campaignType: "search",
      name: "Busca - Consultoria em TI SP",
      objective: "conversions",
      dailyBudgetBrl: 200,
      status: "active",
      externalCampaignId: "google-campaign-001",
      launchedAt: daysAgo(28),
    },
  });

  // Campanha 4: Boost vinculado ao post techPost3
  const techCamp4 = await prisma.adCampaign.create({
    data: {
      id: "camp-tech-boost-case",
      companyId: techCompany.id,
      credentialId: techMetaCred.id,
      platform: "meta",
      campaignType: "boost",
      name: "Boost: instagram - Case Sucesso",
      objective: "Aumentar alcance",
      dailyBudgetBrl: 80,
      status: "active",
      sourcePostId: techPost3.id,
      boostConfirmedAt: daysAgo(4),
      launchedAt: daysAgo(4),
    },
  });

  // Atualiza techPost3 com o boostCampaignId
  await prisma.post.update({
    where: { id: techPost3.id },
    data: { boostCampaignId: techCamp4.id },
  });

  // Campanha 5: Pausada (para testar filtro de status)
  const techCamp5 = await prisma.adCampaign.create({
    data: {
      id: "camp-tech-paused",
      companyId: techCompany.id,
      credentialId: techMetaCred.id,
      platform: "meta",
      campaignType: "social",
      name: "Remarketing - Lista Clientes",
      objective: "conversions",
      dailyBudgetBrl: 80,
      status: "paused",
      launchedAt: daysAgo(60),
    },
  });

  // ── Métricas (30 dias) — campanhas ativas ─────────────────────────────────
  // Campanha 1: boa performance (ROAS 3.5+, CTR 3%+)
  for (let d = 29; d >= 0; d--) {
    const day = daysAgo(d);
    await prisma.adMetricSnapshot.create({
      data: {
        campaignId: techCamp1.id,
        collectedAt: day,
        periodStart: new Date(day.getTime() - 6 * 3_600_000),
        periodEnd: day,
        impressions: 8000 + Math.floor(Math.random() * 2000),
        clicks: 280 + Math.floor(Math.random() * 80),
        conversions: 18 + Math.floor(Math.random() * 8),
        spendBrl: 110 + Math.random() * 20,
        ctr: 0.031 + Math.random() * 0.012,
        cpc: 0.42 + Math.random() * 0.1,
        roas: 3.4 + Math.random() * 0.8,
        rawJson: JSON.stringify({ source: "demo" }),
      },
    });
  }

  // Campanha 2: performance fraca (CTR < 0.8%, ROAS < 1.2)
  for (let d = 29; d >= 0; d--) {
    const day = daysAgo(d);
    await prisma.adMetricSnapshot.create({
      data: {
        campaignId: techCamp2.id,
        collectedAt: day,
        periodStart: new Date(day.getTime() - 6 * 3_600_000),
        periodEnd: day,
        impressions: 12000 + Math.floor(Math.random() * 3000),
        clicks: 72 + Math.floor(Math.random() * 20),
        conversions: 2 + Math.floor(Math.random() * 3),
        spendBrl: 55 + Math.random() * 10,
        ctr: 0.006 + Math.random() * 0.002,
        cpc: 0.75 + Math.random() * 0.2,
        roas: 1.0 + Math.random() * 0.3,
        rawJson: JSON.stringify({ source: "demo" }),
      },
    });
  }

  // Campanha 3 (Google): excelente performance
  for (let d = 29; d >= 0; d--) {
    const day = daysAgo(d);
    await prisma.adMetricSnapshot.create({
      data: {
        campaignId: techCamp3.id,
        collectedAt: day,
        periodStart: new Date(day.getTime() - 6 * 3_600_000),
        periodEnd: day,
        impressions: 4500 + Math.floor(Math.random() * 1000),
        clicks: 360 + Math.floor(Math.random() * 80),
        conversions: 28 + Math.floor(Math.random() * 10),
        spendBrl: 190 + Math.random() * 20,
        ctr: 0.074 + Math.random() * 0.01,
        cpc: 0.52 + Math.random() * 0.08,
        roas: 4.2 + Math.random() * 1.0,
        rawJson: JSON.stringify({ source: "demo" }),
      },
    });
  }

  // ── A/B Tests ─────────────────────────────────────────────────────────────
  // Teste ativo (campanha 1)
  await prisma.abTest.create({
    data: {
      campaignId: techCamp1.id,
      status: "active",
      startedAt: daysAgo(3),
      variationsJson: JSON.stringify([
        { externalAdId: "meta-ad-001a", variationIndex: 1, creative: { headline: "Consultoria TI gratuita", description: "Transforme sua empresa em 30 dias", callToAction: "Saiba Mais" }, impressions: 4200, clicks: 148, ctr: 0.035, isWinner: false },
        { externalAdId: "meta-ad-001b", variationIndex: 2, creative: { headline: "Diagnóstico digital grátis", description: "Descubra os gargalos da sua empresa", callToAction: "Quero Diagnóstico" }, impressions: 4100, clicks: 169, ctr: 0.041, isWinner: false },
        { externalAdId: "meta-ad-001c", variationIndex: 3, creative: { headline: "Reduza 40% dos custos operacionais", description: "Como fizemos isso para dezenas de PMEs", callToAction: "Ver Case" }, impressions: 3800, clicks: 133, ctr: 0.035, isWinner: false },
      ]),
      extensionCount: 0,
    },
  });

  // Teste concluído com vencedor (campanha 3)
  await prisma.abTest.create({
    data: {
      campaignId: techCamp3.id,
      status: "completed",
      startedAt: daysAgo(10),
      endedAt: daysAgo(3),
      winnerAdId: "google-ad-winner",
      variationsJson: JSON.stringify([
        { externalAdId: "google-ad-A", variationIndex: 1, creative: { headline: "Consultoria TI em São Paulo", description: "Especialistas em transformação digital para PMEs", callToAction: "Fale Conosco" }, impressions: 1200, clicks: 96, ctr: 0.080, isWinner: false },
        { externalAdId: "google-ad-winner", variationIndex: 2, creative: { headline: "Reduza custos com TI inteligente", description: "Resultados em até 90 dias ou devolvemos", callToAction: "Garantia Incluída" }, impressions: 1150, clicks: 138, ctr: 0.120, isWinner: true },
        { externalAdId: "google-ad-C", variationIndex: 3, creative: { headline: "PME: pare de perder dinheiro com TI", description: "Auditoria grátis de processos digitais", callToAction: "Quero Auditoria" }, impressions: 1100, clicks: 88, ctr: 0.080, isWinner: false },
      ]),
      resultSummary: "Teste concluído com dados suficientes. Vencedora: Variação 2 com CTR de 12.00% (1150 impressões, 138 cliques). Headline: 'Reduza custos com TI inteligente'.",
      extensionCount: 1,
    },
  });

  // ── Regras de automação ───────────────────────────────────────────────────
  const rule1 = await prisma.automationRule.create({
    data: {
      companyId: techCompany.id,
      campaignId: techCamp2.id,
      name: "Pausar quando CTR < 0.5%",
      isActive: true,
      conditionJson: JSON.stringify({ metric: "ctr", operator: "lt", value: 0.005 }),
      actionJson: JSON.stringify({ type: "pause_ad" }),
    },
  });
  const rule2 = await prisma.automationRule.create({
    data: {
      companyId: techCompany.id,
      campaignId: techCamp1.id,
      name: "Aumentar orçamento quando ROAS > 4",
      isActive: true,
      conditionJson: JSON.stringify({ metric: "roas", operator: "gt", value: 4.0 }),
      actionJson: JSON.stringify({ type: "increase_budget", budgetIncreasePercent: 20 }),
    },
  });
  const rule3 = await prisma.automationRule.create({
    data: {
      companyId: techCompany.id,
      name: "Global: alertar quando CPC > R$2,50",
      isActive: true,
      conditionJson: JSON.stringify({ metric: "cpc", operator: "gt", value: 2.5 }),
      actionJson: JSON.stringify({ type: "pause_ad" }),
    },
  });

  // ── Logs de execução de regras ────────────────────────────────────────────
  await prisma.ruleExecutionLog.createMany({
    data: [
      { ruleId: rule1.id, campaignId: techCamp2.id, executedAt: daysAgo(1), triggered: true, outcome: "executed", apiResponse: JSON.stringify({ success: true }) },
      { ruleId: rule1.id, campaignId: techCamp2.id, executedAt: daysAgo(3), triggered: false, outcome: "skipped", errorMsg: null },
      { ruleId: rule2.id, campaignId: techCamp1.id, executedAt: daysAgo(2), triggered: true, outcome: "pending_confirmation", apiResponse: null },
      { ruleId: rule3.id, campaignId: techCamp1.id, executedAt: hoursAgo(6), triggered: false, outcome: "skipped" },
    ],
  });

  // ── Audit logs ────────────────────────────────────────────────────────────
  await prisma.campaignAuditLog.createMany({
    data: [
      {
        companyId: techCompany.id,
        campaignId: techCamp4.id,
        actionType: "boost_confirmed",
        source: "user",
        userDecision: "approved",
        userDecisionAt: daysAgo(4),
        requiresConfirmation: true,
        metadata: JSON.stringify({ postId: techPost3.id, suggestion: { dailyBudgetBrl: 80, durationDays: 7 } }),
      },
      {
        companyId: techCompany.id,
        campaignId: techCamp1.id,
        actionType: "budget_updated",
        source: "budget_manager",
        previousValues: JSON.stringify({ dailyBudgetBrl: 100 }),
        newValues: JSON.stringify({ dailyBudgetBrl: 120 }),
        requiresConfirmation: false,
        metadata: JSON.stringify({ reason: "ROAS acima de 3.5 por 7 dias consecutivos" }),
      },
      {
        companyId: techCompany.id,
        campaignId: techCamp2.id,
        actionType: "campaign_paused",
        source: "strategic_analyst",
        previousValues: JSON.stringify({ status: "active" }),
        newValues: JSON.stringify({ status: "paused" }),
        requiresConfirmation: true,
        userDecision: "rejected",
        userDecisionAt: daysAgo(2),
        metadata: JSON.stringify({ routeChangeId: "rc-demo-1" }),
      },
      {
        companyId: techCompany.id,
        actionType: "route_change_applied",
        source: "strategic_analyst",
        requiresConfirmation: false,
        metadata: JSON.stringify({ type: "new_audience", title: "Testar público lookalike 2%", expectedImpact: "+15% conversões" }),
      },
    ],
  });

  // ── Logs de custo — Tech ──────────────────────────────────────────────────
  const costData = [
    // Mês atual — variados
    { type: "text", model: "us.anthropic.claude-sonnet-4-6", inputTokens: 1200, outputTokens: 450, costUsd: 0.01035 },
    { type: "text", model: "us.anthropic.claude-sonnet-4-6", inputTokens: 980, outputTokens: 320, costUsd: 0.00774 },
    { type: "image", model: "stability.stable-image-ultra-v1:1", images: 3, costUsd: 0.24 },
    { type: "image", model: "stability.stable-image-ultra-v1:1", images: 3, costUsd: 0.24 },
    { type: "text", model: "us.anthropic.claude-haiku-4-5-20251001-v1:0", inputTokens: 2000, outputTokens: 800, costUsd: 0.0048 },
    { type: "image", model: "stability.stable-image-ultra-v1:1", images: 1, costUsd: 0.08 },
    { type: "text", model: "us.anthropic.claude-sonnet-4-6", inputTokens: 1500, outputTokens: 600, costUsd: 0.0135 },
    { type: "image", model: "stability.stable-image-ultra-v1:1", images: 3, costUsd: 0.24 },
    { type: "text", model: "us.anthropic.claude-sonnet-4-6", inputTokens: 800, outputTokens: 250, costUsd: 0.006 },
    // Mês passado
    { type: "text", model: "us.anthropic.claude-sonnet-4-6", inputTokens: 1100, outputTokens: 380, costUsd: 0.009 },
    { type: "image", model: "stability.stable-image-ultra-v1:1", images: 3, costUsd: 0.24 },
    { type: "image", model: "stability.stable-image-ultra-v1:1", images: 3, costUsd: 0.24 },
  ];
  for (let i = 0; i < costData.length; i++) {
    const c = costData[i]!;
    await prisma.costLog.create({
      data: {
        companyId: techCompany.id,
        type: c.type,
        model: c.model,
        inputTokens: c.inputTokens ?? 0,
        outputTokens: c.outputTokens ?? 0,
        images: c.images ?? 0,
        costUsd: c.costUsd,
        createdAt: daysAgo(i < 9 ? i : i + 20),
      },
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // EMPRESA 2 — Bella Moda (userDemo) — Setor Moda/Vestuário
  // Foco: conteúdo visual, carrosséis, stories, feed grid rico
  // ══════════════════════════════════════════════════════════════════════════

  const modaCompany = await prisma.company.upsert({
    where: { id: "company-moda" },
    update: {},
    create: {
      id: "company-moda",
      userId: userDemo.id,
      name: "Bella Moda",
      description: "Moda feminina contemporânea com identidade própria — roupas que contam histórias",
      sector: "Moda e Vestuário",
      objective: "Aumentar seguidores no Instagram e converter em vendas online",
      tone: "inspirational",
      colors: JSON.stringify(["#EC4899", "#BE185D", "#FDF2F8"]),
      logoUrl: img("EC4899", "BM", 200, 200),
    },
  });

  await prisma.socialAccount.upsert({
    where: { companyId_platform: { companyId: modaCompany.id, platform: "instagram" } },
    update: {},
    create: {
      companyId: modaCompany.id, platform: "instagram",
      profileName: "@bellamoda.oficial", connected: true,
      accessToken: "demo-moda-ig-token", profileId: "moda-ig-profile",
    },
  });
  await prisma.socialAccount.upsert({
    where: { companyId_platform: { companyId: modaCompany.id, platform: "whatsapp" } },
    update: {},
    create: {
      companyId: modaCompany.id, platform: "whatsapp",
      profileName: "+55 11 99999-1234", connected: true,
      accessToken: "demo-moda-wa-token", profileId: "moda-wa-phone",
    },
  });

  // Posts Moda — grid completo 3×3 = 9 slots (publicados + futuros)
  // 6 publicados (posições fixas)
  const modaPosts = [
    { content: "Nova coleção Outono/Inverno chegou! 🍂✨ Cada peça foi pensada para você brilhar todos os dias. Link na bio para ver tudo! #NovaColeção #ModaFeminina #Outono", color: "EC4899", label: "Look+OI+1", publishedAt: daysAgo(20), format: "post" },
    { content: "Combinações do dia: como usar o rosa como cor neutra 🌸 Guarda-roupa cápsula nunca foi tão elegante. Salva esse post! #ModaDica #GuardaRoupaCápsula", color: "DB2777", label: "Look+Rosa", publishedAt: daysAgo(15), format: "post" },
    { content: "Behind the scenes do nosso ensaio fotográfico 📸 Amor por cada detalhe. #BTS #FotoModa #Bastidores", color: "BE185D", label: "BTS+Ensaio", publishedAt: daysAgo(10), format: "story" },
    { content: "5 looks para usar no trabalho sem abrir mão do estilo → Deslize para ver todos ✨", color: "9D174D", label: "Looks+Trabalho", publishedAt: daysAgo(7), format: "carousel" },
    { content: "Tendência da semana: oversize is the new black 🖤 Como usar peças grandes com elegância. #Tendência #Oversize", color: "831843", label: "Oversize+Look", publishedAt: daysAgo(4), format: "post" },
    { content: "Novidade: agora temos entrega expressa em 24h para SP! 🛍️ Compre hoje, use amanhã. Link na bio. #DeliveryExpress #ModaRápida", color: "6D1B3E", label: "Entrega+Express", publishedAt: daysAgo(1), format: "post" },
  ];
  for (const p of modaPosts) {
    await prisma.post.create({
      data: {
        companyId: modaCompany.id,
        platform: "instagram",
        format: p.format,
        content: p.content,
        imageUrl: img(p.color, p.label, p.format === "story" ? 1080 : 1080, p.format === "story" ? 1920 : 1080),
        status: "published",
        publishedAt: p.publishedAt as Date,
        gridOrder: null,
        ...(p.format === "carousel" ? {
          slidesJson: JSON.stringify([
            { id: "ms0", imageUrl: img(p.color, "Look+1"), headline: "Look casual elegante", order: 0 },
            { id: "ms1", imageUrl: img("DB2777", "Look+2"), headline: "Look trabalho formal", order: 1 },
            { id: "ms2", imageUrl: img("BE185D", "Look+3"), headline: "Look jantar especial", order: 2 },
            { id: "ms3", imageUrl: img("9D174D", "Look+4"), headline: "Look fim de semana", order: 3 },
            { id: "ms4", imageUrl: img("831843", "Look+5"), headline: "Look evento cultural", order: 4 },
          ]),
        } : {}),
      },
    });
  }
  // 3 agendados (posições futuras no grid)
  const modaFuture = [
    { content: "Já imaginou um guarda-roupa que funciona para qualquer ocasião? 🎯 5 peças coringa que você precisa ter. Deslize →", color: "F9A8D4", label: "Peças+Coringa", scheduledAt: daysAhead(1), gridOrder: 0, format: "carousel" },
    { content: "Depoimento real da nossa cliente Ana Paula ❤️ 'Comprar na Bella Moda mudou minha relação com a moda.' #Depoimento #ClientesReais", color: "FBCFE8", label: "Depoimento", scheduledAt: daysAhead(3), gridOrder: 1, format: "post" },
    { content: "Ensaio de primavera — preview exclusivo para seguidoras 🌸 Prepare-se para apaixonar!", color: "FDF2F8", label: "Preview+Primavera", scheduledAt: daysAhead(5), gridOrder: 2, format: "story" },
  ];
  for (const p of modaFuture) {
    await prisma.post.create({
      data: {
        companyId: modaCompany.id,
        platform: "instagram",
        format: p.format,
        content: p.content,
        imageUrl: img(p.color, p.label, p.format === "story" ? 1080 : 1080, p.format === "story" ? 1920 : 1080),
        status: "scheduled",
        scheduledAt: p.scheduledAt,
        gridOrder: p.gridOrder,
        ...(p.format === "carousel" ? {
          slidesJson: JSON.stringify([
            { id: "mc0", imageUrl: img(p.color, "Peça+1"), headline: "Calça wide leg", order: 0 },
            { id: "mc1", imageUrl: img("F9A8D4", "Peça+2"), headline: "Blazer oversized", order: 1 },
            { id: "mc2", imageUrl: img("FBCFE8", "Peça+3"), headline: "Vestido midi", order: 2 },
            { id: "mc3", imageUrl: img("FCE7F3", "Peça+4"), headline: "Camisa branca premium", order: 3 },
            { id: "mc4", imageUrl: img("FDF2F8", "Peça+5"), headline: "Tênis chunky branco", order: 4 },
          ]),
        } : {}),
      },
    });
  }
  // 2 rascunhos
  await prisma.post.createMany({
    data: [
      { companyId: modaCompany.id, platform: "instagram", format: "reel", content: "Transformação completa: de peças básicas a um look incrível em 60 segundos ⏱️ #GetReadyWithMe #TransformaçãoFashion", status: "draft", gridOrder: 3 },
      { companyId: modaCompany.id, platform: "instagram", format: "post", content: "Novidade em breve... 🤫 #TeasePost #NovaColeção", status: "draft", gridOrder: 4 },
    ],
  });

  // Logs de custo — Moda
  for (let i = 0; i < 6; i++) {
    await prisma.costLog.create({
      data: {
        companyId: modaCompany.id,
        type: i % 2 === 0 ? "image" : "text",
        model: i % 2 === 0 ? "stability.stable-image-ultra-v1:1" : "us.anthropic.claude-sonnet-4-6",
        inputTokens: i % 2 === 0 ? 0 : 900,
        outputTokens: i % 2 === 0 ? 0 : 300,
        images: i % 2 === 0 ? 3 : 0,
        costUsd: i % 2 === 0 ? 0.24 : 0.0072,
        createdAt: daysAgo(i * 3),
      },
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // EMPRESA 3 — Sabor & Arte (userDemo) — Gastronomia
  // Foco: sem tráfego pago, apenas conteúdo orgânico — testa caso "sem dados"
  // ══════════════════════════════════════════════════════════════════════════

  const gastroCompany = await prisma.company.upsert({
    where: { id: "company-gastro" },
    update: {},
    create: {
      id: "company-gastro",
      userId: userDemo.id,
      name: "Sabor & Arte Gastronomia",
      description: "Restaurante contemporâneo com culinária autoral brasileira e ingredientes locais",
      sector: "Alimentação",
      objective: "Aumentar reservas e fortalecer presença nas redes sociais",
      tone: "funny",
      colors: JSON.stringify(["#F97316", "#EA580C", "#FFF7ED"]),
      logoUrl: img("F97316", "SA", 200, 200),
    },
  });

  await prisma.socialAccount.upsert({
    where: { companyId_platform: { companyId: gastroCompany.id, platform: "instagram" } },
    update: {},
    create: {
      companyId: gastroCompany.id, platform: "instagram",
      profileName: "@saborarte.gourmet", connected: true,
      accessToken: "demo-gastro-token", profileId: "gastro-ig-profile",
    },
  });
  // Facebook desconectado (token expirado) — testa alerta
  await prisma.socialAccount.upsert({
    where: { companyId_platform: { companyId: gastroCompany.id, platform: "facebook" } },
    update: {},
    create: {
      companyId: gastroCompany.id, platform: "facebook",
      profileName: "Sabor & Arte", connected: false, // token expirado
      accessToken: null,
    },
  });

  await prisma.post.createMany({
    data: [
      { companyId: gastroCompany.id, platform: "instagram", format: "post", content: "Hoje no cardápio: risoto de cogumelos selvagens com trufa negra 🍄✨ Reserve sua mesa! Link na bio. #Gastronomia #RisotoPerfeito #SaborArte", imageUrl: img("F97316", "Risoto"), status: "published", publishedAt: daysAgo(7), gridOrder: null },
      { companyId: gastroCompany.id, platform: "instagram", format: "post", content: "Nossa chef Camila preparou uma surpresa para o fim de semana 🎁 Spoiler: envolve trufas e champagne 🍾 #ChefEspecial #Surpresa", imageUrl: img("EA580C", "Chef+Camila"), status: "published", publishedAt: daysAgo(4), gridOrder: null },
      { companyId: gastroCompany.id, platform: "instagram", format: "story", content: "Últimas vagas para o jantar degustação de sábado! 7 tempos com harmonização de vinhos 🍷", imageUrl: img("C2410C", "Jantar+Degustação", 1080, 1920), status: "scheduled", scheduledAt: daysAhead(1), gridOrder: 0 },
      { companyId: gastroCompany.id, platform: "instagram", format: "post", content: "Domingo em família no Sabor & Arte: brunch especial das 10h às 14h 🥞☕ #Brunch #DomingoDeFamília", status: "draft", gridOrder: 1 },
    ],
  });

  // ══════════════════════════════════════════════════════════════════════════
  // EMPRESA 4 — Agência Criativa (userAgencia)
  // Foco: dados mínimos para testar conta separada
  // ══════════════════════════════════════════════════════════════════════════

  const agenciaCompany = await prisma.company.upsert({
    where: { id: "company-agencia" },
    update: {},
    create: {
      id: "company-agencia",
      userId: userAgencia.id,
      name: "Pixel Criativo",
      description: "Agência de marketing digital especializada em conteúdo criativo para PMEs",
      sector: "Publicidade e Marketing",
      objective: "Demonstrar resultados e conquistar novos clientes",
      tone: "professional",
      colors: JSON.stringify(["#8B5CF6", "#6D28D9", "#F5F3FF"]),
      logoUrl: img("8B5CF6", "PC", 200, 200),
    },
  });

  await prisma.socialAccount.upsert({
    where: { companyId_platform: { companyId: agenciaCompany.id, platform: "instagram" } },
    update: {},
    create: {
      companyId: agenciaCompany.id, platform: "instagram",
      profileName: "@pixelcriativo.ag", connected: true,
      accessToken: "demo-agencia-token", profileId: "agencia-ig-profile",
    },
  });
  await prisma.socialAccount.upsert({
    where: { companyId_platform: { companyId: agenciaCompany.id, platform: "linkedin" } },
    update: {},
    create: {
      companyId: agenciaCompany.id, platform: "linkedin",
      profileName: "Pixel Criativo", connected: true,
      accessToken: "demo-agencia-li-token", profileId: "agencia-li-profile",
    },
  });

  await prisma.post.createMany({
    data: [
      { companyId: agenciaCompany.id, platform: "instagram", format: "post", content: "Case do mês: como levamos uma PME de 500 para 5.000 seguidores em 60 dias com estratégia de conteúdo 📈 #CaseDeSuccesso #Marketing", imageUrl: img("8B5CF6", "Case+5K"), status: "published", publishedAt: daysAgo(5) },
      { companyId: agenciaCompany.id, platform: "linkedin", format: "post", content: "Marketing de conteúdo não é sobre quantidade — é sobre consistência e relevância. Como sua agência está posicionada para 2026?", status: "draft" },
    ],
  });

  // Crédito de vídeo para agência
  await prisma.videoCredit.upsert({
    where: { companyId_billingPeriodStart: { companyId: agenciaCompany.id, billingPeriodStart: new Date("2026-05-01T00:00:00Z") } },
    update: {},
    create: {
      companyId: agenciaCompany.id,
      billingPeriodStart: new Date("2026-05-01T00:00:00Z"),
      totalCredits: 10,
      usedCredits: 3,
    },
  });

  // ══════════════════════════════════════════════════════════════════════════
  // EMPRESA 5 — userTrial (empresa incompleta — para testar validações)
  // ══════════════════════════════════════════════════════════════════════════

  await prisma.company.upsert({
    where: { id: "company-trial" },
    update: {},
    create: {
      id: "company-trial",
      userId: userTrial.id,
      name: "Minha Primeira Empresa",
      // sem sector, sem objective, sem colors — testa campos vazios
      tone: "professional",
    },
  });

  // ══════════════════════════════════════════════════════════════════════════
  // VideoJobs — Tech (vários estados do pipeline)
  // ══════════════════════════════════════════════════════════════════════════

  await prisma.videoJob.createMany({
    data: [
      {
        companyId: techCompany.id,
        status: "completed",
        progress: 100,
        platform: "instagram_reels",
        targetDuration: 30,
        visualStyle: "cinematic",
        tone: "professional",
        narratorVoice: "Camila",
        contextDescription: "Showcase de resultados da consultoria tech em PMEs brasileiras",
        ctaText: "Agende uma consultoria gratuita pelo link na bio!",
        useAsInspiration: false,
        framesExtracted: 45,
        framesTransformed: 45,
        outputDurationSeconds: 30,
        outputResolution: "1080x1920",
        estimatedCostUsd: 1.24,
        creditDeducted: true,
        startedAt: daysAgo(5),
        completedAt: daysAgo(5),
        rawVideoS3Key: "videos/job-tech-1/raw/original.mp4",
        outputS3Key: "videos/job-tech-1/output/final.mp4",
      },
      {
        companyId: techCompany.id,
        status: "error",
        progress: 45,
        errorMessage: "Stable Diffusion retornou erro 503 na transformação dos frames. Tente novamente.",
        platform: "instagram_reels",
        targetDuration: 15,
        visualStyle: "minimalist",
        tone: "professional",
        narratorVoice: "Ricardo",
        contextDescription: "Explicação técnica sobre automação de processos com IA",
        useAsInspiration: true,
        startedAt: daysAgo(2),
        rawVideoS3Key: "videos/job-tech-2/raw/original.mp4",
      },
      {
        companyId: techCompany.id,
        status: "queued",
        progress: 0,
        platform: "instagram_reels",
        targetDuration: 60,
        visualStyle: "realistic",
        tone: "professional",
        narratorVoice: "Camila",
        contextDescription: "Tour pelo escritório e apresentação da equipe de consultores",
        useAsInspiration: false,
      },
    ],
  });

  // VideoCredit — Tech
  await prisma.videoCredit.upsert({
    where: { companyId_billingPeriodStart: { companyId: techCompany.id, billingPeriodStart: new Date("2026-05-01T00:00:00Z") } },
    update: {},
    create: {
      companyId: techCompany.id,
      billingPeriodStart: new Date("2026-05-01T00:00:00Z"),
      totalCredits: 20,
      usedCredits: 1,
    },
  });

  // VideoCredit — Moda
  await prisma.videoCredit.upsert({
    where: { companyId_billingPeriodStart: { companyId: modaCompany.id, billingPeriodStart: new Date("2026-05-01T00:00:00Z") } },
    update: {},
    create: {
      companyId: modaCompany.id,
      billingPeriodStart: new Date("2026-05-01T00:00:00Z"),
      totalCredits: 5,
      usedCredits: 0,
    },
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Relatório final
  // ══════════════════════════════════════════════════════════════════════════

  console.log("\n✅ Seed executado com sucesso!\n");
  console.log("═══════════════════════════════════════════════════════");
  console.log("  CREDENCIAIS DE ACESSO");
  console.log("═══════════════════════════════════════════════════════");
  console.log("  Usuário principal (3 empresas, plano Agência)");
  console.log("  Email: demo@mktdigital.com");
  console.log("  Senha: demo123");
  console.log("");
  console.log("  Gestor de agência (1 empresa, plano Pro)");
  console.log("  Email: agencia@mktdigital.com");
  console.log("  Senha: demo123");
  console.log("");
  console.log("  Usuário trial (empresa incompleta, sem dados)");
  console.log("  Email: trial@mktdigital.com");
  console.log("  Senha: demo123");
  console.log("═══════════════════════════════════════════════════════");
  console.log("\n  EMPRESAS CRIADAS:");
  console.log("  1. Tech Solutions Brasil  → tráfego pago completo");
  console.log("     - 3 campanhas ativas (Meta + Google) com 30 dias de métricas");
  console.log("     - 1 campanha pausada, 1 campanha boost");
  console.log("     - A/B test ativo + concluído");
  console.log("     - 3 regras de automação com logs");
  console.log("     - Posts: publicados, agendados, rascunhos (post/carrossel/reel/story)");
  console.log("     - 1 post turbinado (boost) com campanha vinculada");
  console.log("     - 3 VideoJobs (completed/error/queued)");
  console.log("");
  console.log("  2. Bella Moda             → feed grid 3×3 completo");
  console.log("     - 6 posts publicados + 3 agendados + 2 rascunhos");
  console.log("     - Carrosséis com 5-7 slides");
  console.log("     - Stories (publicado + agendado)");
  console.log("");
  console.log("  3. Sabor & Arte           → sem tráfego pago");
  console.log("     - Testa análise estratégica sem dados");
  console.log("     - Facebook desconectado (token expirado)");
  console.log("");
  console.log("  4. Pixel Criativo (agencia@) → conta separada");
  console.log("");
  console.log("  5. Minha Primeira Empresa (trial@) → empresa incompleta");
  console.log("     - Testa validações de bio/auditoria sem campos obrigatórios");
  console.log("═══════════════════════════════════════════════════════\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
