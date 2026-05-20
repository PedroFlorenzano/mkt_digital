/**
 * strategic-analyst.service.ts
 *
 * Strategic analysis service for AI Paid Traffic campaigns.
 *
 * Responsibilities:
 *  1. Generate a StrategicDiagnosis from active campaign metrics (generateDiagnosis)
 *  2. Apply a RouteChange recommendation to campaign data (applyRouteChange)
 */

import { prisma } from "@server/lib/prisma";
import { generateTextWithBedrock } from "@server/lib/bedrock";
import { logger } from "@server/lib/logger";
import { ValidationError, ExternalServiceError } from "@server/lib/errors";

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

export interface RouteChange {
  id: string;
  title: string;
  description: string;       // what action to take
  expectedImpact: string;
  type: "budget_adjustment" | "pause_campaign" | "new_audience" | "editorial";
  campaignId?: string;
  campaignName?: string;     // enriched after parse — never relies on AI to return it
  suggestedBudgetBrl?: number;
}

export interface StrategicDiagnosis {
  strengths: string[];         // campaigns performing well
  alerts: string[];            // campaigns with issues (criteria cited)
  routeChanges: RouteChange[]; // exactly 3
  generatedAt: Date;
  aiSummary: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Minimum number of days of snapshot data required to qualify a campaign. */
const MIN_DAYS_REQUIRED = 7;

/** Look-back window for metric aggregation. */
const LOOKBACK_DAYS = 30;

/** Fallback RouteChange for when the AI returns fewer than 3 items. */
function buildFallbackRouteChange(index: number): RouteChange {
  return {
    id: crypto.randomUUID(),
    title: `Revisão estratégica ${index + 1}`,
    description:
      "Analise manualmente os dados das campanhas para identificar oportunidades de melhoria.",
    expectedImpact: "Melhoria gradual das métricas de performance.",
    type: "editorial",
  };
}

// ---------------------------------------------------------------------------
// Service implementation
// ---------------------------------------------------------------------------

export const strategicAnalystService = {
  /**
   * Generates a StrategicDiagnosis for a company's active campaigns.
   *
   * 1. Loads all active campaigns for the company.
   * 2. Aggregates AdMetricSnapshot data from the last 30 days per campaign.
   * 3. Throws ValidationError if no campaigns qualify (< 7 days of data).
   * 4. Builds a prompt and calls generateTextWithBedrock.
   * 5. Parses the JSON response and normalises routeChanges to exactly 3.
   * 6. Returns StrategicDiagnosis.
   */
  async generateDiagnosis(companyId: string): Promise<StrategicDiagnosis> {
    const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

    // 1. Load all active campaigns for the company
    const campaigns = await prisma.adCampaign.findMany({
      where: { companyId, status: "active" },
    });

    if (campaigns.length === 0) {
      throw new ValidationError(
        "Não há dados suficientes para análise estratégica (mínimo 7 dias de campanhas ativas)",
      );
    }

    // 2. Aggregate metric snapshots from the last 30 days for each campaign
    interface CampaignMetrics {
      campaignId: string;
      name: string;
      platform: string;
      dailyBudgetBrl: number;
      daysWithData: number;
      totalImpressions: number;
      totalClicks: number;
      totalConversions: number;
      totalSpendBrl: number;
      avgCtr: number;
      avgCpc: number;
      avgRoas: number;
    }

    const campaignMetrics: CampaignMetrics[] = [];

    for (const campaign of campaigns) {
      const snapshots = await prisma.adMetricSnapshot.findMany({
        where: {
          campaignId: campaign.id,
          collectedAt: { gte: since },
        },
        orderBy: { collectedAt: "asc" },
      });

      if (snapshots.length === 0) continue;

      // Count distinct days that have snapshot data
      const distinctDays = new Set(
        snapshots.map((s) => s.collectedAt.toISOString().slice(0, 10)),
      ).size;

      if (distinctDays < MIN_DAYS_REQUIRED) continue;

      const totalImpressions = snapshots.reduce((s, m) => s + m.impressions, 0);
      const totalClicks = snapshots.reduce((s, m) => s + m.clicks, 0);
      const totalConversions = snapshots.reduce((s, m) => s + m.conversions, 0);
      const totalSpendBrl = snapshots.reduce((s, m) => s + m.spendBrl, 0);
      const avgCtr = snapshots.length > 0
        ? snapshots.reduce((s, m) => s + m.ctr, 0) / snapshots.length
        : 0;
      const avgCpc = snapshots.length > 0
        ? snapshots.reduce((s, m) => s + m.cpc, 0) / snapshots.length
        : 0;
      const avgRoas = snapshots.length > 0
        ? snapshots.reduce((s, m) => s + m.roas, 0) / snapshots.length
        : 0;

      campaignMetrics.push({
        campaignId: campaign.id,
        name: campaign.name,
        platform: campaign.platform,
        dailyBudgetBrl: campaign.dailyBudgetBrl,
        daysWithData: distinctDays,
        totalImpressions,
        totalClicks,
        totalConversions,
        totalSpendBrl,
        avgCtr,
        avgCpc,
        avgRoas,
      });
    }

    // 3. Validate that at least one campaign qualifies
    if (campaignMetrics.length === 0) {
      throw new ValidationError(
        "Não há dados suficientes para análise estratégica (mínimo 7 dias de campanhas ativas)",
      );
    }

    // 4. Build the prompt
    const portfolioAvgRoas =
      campaignMetrics.reduce((s, c) => s + c.avgRoas, 0) / campaignMetrics.length;

    const campaignSummaries = campaignMetrics
      .map(
        (c) =>
          `- Campanha: "${c.name}" (ID: ${c.campaignId}, plataforma: ${c.platform})\n` +
          `  Orçamento diário: R$ ${c.dailyBudgetBrl.toFixed(2)}\n` +
          `  Dias com dados: ${c.daysWithData}\n` +
          `  Impressões totais: ${c.totalImpressions.toLocaleString("pt-BR")}\n` +
          `  Cliques totais: ${c.totalClicks.toLocaleString("pt-BR")}\n` +
          `  Conversões: ${c.totalConversions}\n` +
          `  Gasto total: R$ ${c.totalSpendBrl.toFixed(2)}\n` +
          `  CTR médio: ${(c.avgCtr * 100).toFixed(2)}%\n` +
          `  CPC médio: R$ ${c.avgCpc.toFixed(2)}\n` +
          `  ROAS médio: ${c.avgRoas.toFixed(2)}x`,
      )
      .join("\n\n");

    const systemPrompt = `Você é um especialista sênior em tráfego pago e marketing de performance digital.
Analise os dados das campanhas fornecidos e produza um diagnóstico estratégico em português.
Responda EXCLUSIVAMENTE com um objeto JSON válido, sem texto adicional, sem markdown, sem blocos de código.
IMPORTANTE: mantenha cada campo de texto (description, expectedImpact, aiSummary) CONCISO — máximo 2 frases por campo.`;

    const userMessage = `Analise as seguintes campanhas ativas e gere um diagnóstico estratégico.

ROAS médio do portfólio: ${portfolioAvgRoas.toFixed(2)}x

Campanhas:
${campaignSummaries}

Critérios:
- Pontos fortes: ROAS > ${(portfolioAvgRoas * 2).toFixed(2)}x OU CTR > 3%
- Alertas: CTR < 1%, ROAS < 1.5, ou CPC > 2x a média do portfólio

Retorne APENAS este JSON (sem nenhum texto fora do objeto):
{
  "strengths": ["string curta por ponto forte"],
  "alerts": ["string curta por alerta"],
  "routeChanges": [
    {
      "id": "uuid-1",
      "title": "título em até 6 palavras",
      "description": "ação recomendada em 1-2 frases",
      "expectedImpact": "impacto esperado em 1 frase",
      "type": "budget_adjustment | pause_campaign | new_audience | editorial",
      "campaignId": "id da campanha se aplicável",
      "suggestedBudgetBrl": 0
    }
  ],
  "aiSummary": "resumo executivo em 2-3 frases"
}

REGRAS OBRIGATÓRIAS:
1. routeChanges deve ter EXATAMENTE 3 itens.
2. Todos os campos devem ser strings curtas — sem listas, bullets ou parágrafos longos.
3. O JSON deve estar completo e válido — não corte a resposta.`;

    // 5. Call Bedrock — usa 4000 tokens para garantir que o JSON não seja truncado
    const bedrockResult = await generateTextWithBedrock(
      companyId,
      systemPrompt,
      userMessage,
      4000,
    );

    const rawText = bedrockResult.options?.[0]?.content ?? "";

    logger.info("[strategic-analyst] Bedrock response received", {
      companyId,
      model: bedrockResult.usage.model,
      costUsd: bedrockResult.usage.costUsd,
      campaignsAnalysed: campaignMetrics.length,
    });

    // 6. Parse the JSON response
    let parsed: {
      strengths?: string[];
      alerts?: string[];
      routeChanges?: RouteChange[];
      aiSummary?: string;
    };

    try {
      // Try exact match first
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      const candidate = jsonMatch ? jsonMatch[0] : rawText;
      parsed = JSON.parse(candidate);
    } catch {
      // JSON was truncated — try to recover partial data field by field
      logger.warn("[strategic-analyst] JSON truncated or malformed — attempting partial recovery", {
        companyId,
        rawTextLength: rawText.length,
        rawTextTail: rawText.slice(-200),
      });

      parsed = {};

      // Extract strengths array if present
      const strengthsMatch = rawText.match(/"strengths"\s*:\s*(\[[^\]]*\])/);
      if (strengthsMatch) {
        try { parsed.strengths = JSON.parse(strengthsMatch[1] ?? "") as string[]; } catch { /* skip */ }
      }

      // Extract alerts array if present
      const alertsMatch = rawText.match(/"alerts"\s*:\s*(\[[^\]]*\])/);
      if (alertsMatch) {
        try { parsed.alerts = JSON.parse(alertsMatch[1] ?? "") as string[]; } catch { /* skip */ }
      }

      // Extract aiSummary string if present
      const summaryMatch = rawText.match(/"aiSummary"\s*:\s*"([^"]+)"/);
      if (summaryMatch?.[1]) {
        parsed.aiSummary = summaryMatch[1];
      }

      // Extract complete routeChanges objects (only fully closed ones)
      const routeChangesMatch = rawText.match(/"routeChanges"\s*:\s*(\[[^\]]*\])/);
      if (routeChangesMatch) {
        try { parsed.routeChanges = JSON.parse(routeChangesMatch[1] ?? "") as RouteChange[]; } catch { /* skip */ }
      }
    }

    const strengths: string[] = Array.isArray(parsed.strengths) ? parsed.strengths : [];
    const alerts: string[] = Array.isArray(parsed.alerts) ? parsed.alerts : [];
    const aiSummary: string =
      typeof parsed.aiSummary === "string" ? parsed.aiSummary : rawText;

    // Assign IDs if the AI omitted them, and enrich with campaign name
    const campaignNameById = new Map(
      campaignMetrics.map((c) => [c.campaignId, c.name]),
    );

    let routeChanges: RouteChange[] = Array.isArray(parsed.routeChanges)
      ? parsed.routeChanges.map((rc) => ({
          ...rc,
          id: typeof rc.id === "string" && rc.id.length > 0 ? rc.id : crypto.randomUUID(),
          // Always resolve the name from our own DB data — never trust AI to return it correctly
          campaignName: rc.campaignId ? (campaignNameById.get(rc.campaignId) ?? rc.campaignName) : rc.campaignName,
        }))
      : [];

    // 7. Pad or trim to exactly 3 route changes
    while (routeChanges.length < 3) {
      routeChanges.push(buildFallbackRouteChange(routeChanges.length));
    }
    if (routeChanges.length > 3) {
      routeChanges = routeChanges.slice(0, 3);
    }

    // 8. Return StrategicDiagnosis
    const diagnosis: StrategicDiagnosis = {
      strengths,
      alerts,
      routeChanges,
      generatedAt: new Date(),
      aiSummary,
    };

    logger.info("[strategic-analyst] Diagnosis generated", {
      companyId,
      strengths: strengths.length,
      alerts: alerts.length,
      routeChanges: routeChanges.length,
    });

    return diagnosis;
  },

  /**
   * Applies a RouteChange recommendation to the database.
   *
   * - "budget_adjustment": updates AdCampaign.dailyBudgetBrl and logs.
   * - "pause_campaign": updates AdCampaign.status and logs.
   * - "new_audience" | "editorial": logs with full routeChange metadata.
   *
   * All DB writes are wrapped in try/catch; errors are logged and rethrown
   * as ExternalServiceError.
   */
  async applyRouteChange(
    companyId: string,
    routeChange: RouteChange,
    userId: string,
  ): Promise<void> {
    try {
      if (routeChange.type === "budget_adjustment") {
        if (routeChange.campaignId && routeChange.suggestedBudgetBrl !== undefined) {
          // Delegate to budgetIntelligenceService.apply so the change is
          // pushed to the actual ad platform (Meta/Google) via their APIs,
          // with the same R$500 confirmation threshold used everywhere else.
          const { budgetIntelligenceService } = await import(
            "@server/services/budget-intelligence.service"
          );

          const { applied, pendingConfirmation } = await budgetIntelligenceService.apply(
            {
              companyId,
              allocations: [
                {
                  campaignId: routeChange.campaignId,
                  newDailyBudgetBrl: routeChange.suggestedBudgetBrl,
                },
              ],
            },
            userId,
          );

          logger.info("[strategic-analyst] Budget adjustment delegated to budget-intelligence", {
            companyId,
            campaignId: routeChange.campaignId,
            suggestedBudgetBrl: routeChange.suggestedBudgetBrl,
            applied,
            pendingConfirmation,
          });
        } else {
          logger.warn("[strategic-analyst] budget_adjustment skipped: missing campaignId or suggestedBudgetBrl", {
            companyId,
            routeChangeId: routeChange.id,
          });
        }
      } else if (routeChange.type === "pause_campaign") {
        if (routeChange.campaignId) {
          await prisma.adCampaign.update({
            where: { id: routeChange.campaignId },
            data: { status: "paused" },
          });

          await prisma.campaignAuditLog.create({
            data: {
              companyId,
              campaignId: routeChange.campaignId,
              actionType: "campaign_paused",
              source: "strategic_analyst",
              previousValues: JSON.stringify({ status: "active" }),
              newValues: JSON.stringify({ status: "paused" }),
              metadata: JSON.stringify({ routeChangeId: routeChange.id, userId }),
            },
          });

          logger.info("[strategic-analyst] Campaign paused", {
            companyId,
            campaignId: routeChange.campaignId,
          });
        } else {
          logger.warn("[strategic-analyst] pause_campaign skipped: missing campaignId", {
            companyId,
            routeChangeId: routeChange.id,
          });
        }
      } else {
        // "new_audience" | "editorial" — log only
        await prisma.campaignAuditLog.create({
          data: {
            companyId,
            campaignId: routeChange.campaignId ?? null,
            actionType: "route_change_applied",
            source: "strategic_analyst",
            metadata: JSON.stringify(routeChange),
          },
        });

        logger.info("[strategic-analyst] Route change logged", {
          companyId,
          type: routeChange.type,
          routeChangeId: routeChange.id,
        });
      }
    } catch (err) {
      logger.error("[strategic-analyst] Failed to apply route change", err, {
        companyId,
        routeChangeId: routeChange.id,
        type: routeChange.type,
      });
      throw new ExternalServiceError(
        "strategic_analyst",
        err instanceof Error ? err.message : "Failed to apply route change",
      );
    }
  },
};
