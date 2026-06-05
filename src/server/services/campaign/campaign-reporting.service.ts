/**
 * campaign-reporting.service.ts
 * AI-powered performance analysis.
 */

import { prisma } from "@server/lib/prisma";
import { generateTextWithBedrock } from "@server/lib/bedrock";
import { ExternalServiceError, NotFoundError } from "@server/lib/errors";
import { logger } from "@server/lib/logger";
import type { PerformanceReport } from "./campaign.types";

export async function getPerformanceReport(
  companyId: string,
  campaignId: string,
  since: Date,
  until: Date,
): Promise<PerformanceReport> {
  const campaign = await prisma.adCampaign.findUnique({ where: { id: campaignId } });
  if (!campaign || campaign.companyId !== companyId) throw new NotFoundError(`Campanha com id '${campaignId}'`);

  const snapshots = await prisma.adMetricSnapshot.findMany({
    where: { campaignId, collectedAt: { gte: since, lte: until } },
    orderBy: { collectedAt: "asc" },
  });

  const totalSpend = snapshots.reduce((sum, s) => sum + s.spendBrl, 0);
  const totalConversions = snapshots.reduce((sum, s) => sum + s.conversions, 0);
  const avgRoas = snapshots.length > 0 ? snapshots.reduce((sum, s) => sum + s.roas, 0) / snapshots.length : 0;
  const costPerConversion = totalConversions > 0 ? totalSpend / totalConversions : 0;

  const systemPrompt = `Você é um especialista em tráfego pago. Analise a performance e gere JSON:
{"aiSummary": "string", "recommendations": ["string"]}
Responda APENAS com o JSON.`;

  const userMessage = `Campanha: ${campaign.name} | Plataforma: ${campaign.platform}
Período: ${since.toISOString()} a ${until.toISOString()} | Snapshots: ${snapshots.length}
Investimento: R$${totalSpend.toFixed(2)} | Conversões: ${totalConversions} | CPA: R$${costPerConversion.toFixed(2)} | ROAS: ${avgRoas.toFixed(2)}
${snapshots.map(s => `${s.collectedAt.toISOString()}: imp=${s.impressions} clk=${s.clicks} conv=${s.conversions} spend=R$${s.spendBrl.toFixed(2)} CTR=${(s.ctr * 100).toFixed(2)}% ROAS=${s.roas.toFixed(2)}`).join("\n")}`;

  let aiSummary: string;
  let recommendations: string[];

  try {
    const result = await generateTextWithBedrock(companyId, systemPrompt, userMessage);
    const rawContent = result.options?.[0]?.content ?? "";
    let parsed: Record<string, unknown> | null = null;
    try {
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    } catch { /* fallback */ }
    if (!parsed) parsed = { aiSummary: rawContent || "Sem dados suficientes.", recommendations: [] };
    aiSummary = typeof parsed["aiSummary"] === "string" ? parsed["aiSummary"] : "Sem dados suficientes.";
    recommendations = Array.isArray(parsed["recommendations"]) ? (parsed["recommendations"] as string[]).filter(r => typeof r === "string") : [];
    logger.info("[campaign] Report generated", { companyId, campaignId, costUsd: result.usage.costUsd });
  } catch (err) {
    throw new ExternalServiceError("AWS Bedrock", err instanceof Error ? err.message : String(err));
  }

  return { campaign, snapshots, aiSummary, recommendations };
}
