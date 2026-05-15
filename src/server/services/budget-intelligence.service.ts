/**
 * budget-intelligence.service.ts
 *
 * Serviço de inteligência orçamentária para o módulo de Tráfego Pago com IA.
 *
 * Responsabilidades:
 *  - getRecommendations: analisa métricas dos últimos 30 dias de todas as
 *    campanhas ativas e gera recomendações de orçamento via AWS Bedrock.
 *  - apply: aplica as alocações aprovadas, chamando o conector de cada
 *    plataforma para orçamentos <= R$500 e gerando logs de confirmação para
 *    valores acima desse threshold.
 */

import { prisma } from "@server/lib/prisma";
import { generateTextWithBedrock } from "@server/lib/bedrock";
import { ExternalServiceError, NotFoundError } from "@server/lib/errors";
import { logger } from "@server/lib/logger";
import { credentialService } from "@server/services/credential.service";
import { metaAdsConnector } from "@server/lib/meta-ads.connector";
import { googleAdsConnector } from "@server/lib/google-ads.connector";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface BudgetAllocation {
  campaignId: string;
  campaignName: string;
  platform: string;
  currentDailyBudgetBrl: number;
  recommendedDailyBudgetBrl: number;
  changePercent: number;
  justification: string;
  /** < 7 days of data = 'insufficient'; >= 7 days = 'sufficient' */
  dataConfidence: "sufficient" | "insufficient";
}

export interface BudgetRecommendation {
  allocations: BudgetAllocation[];
  totalCurrentBrl: number;
  totalRecommendedBrl: number;
  generatedAt: Date;
  aiSummary: string;
}

export interface ApplyBudgetInput {
  companyId: string;
  allocations: Array<{
    campaignId: string;
    newDailyBudgetBrl: number;
  }>;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Threshold in BRL above which a budget change requires human confirmation. */
const CONFIRMATION_THRESHOLD_BRL = 500;

/** Number of days to look back when aggregating metrics. */
const LOOKBACK_DAYS = 30;

/** Minimum days of data for 'sufficient' confidence. */
const MIN_CONFIDENCE_DAYS = 7;

/**
 * Builds the Portuguese-language Bedrock prompt for budget recommendations.
 */
function buildBudgetPrompt(
  campaigns: Array<{
    campaignId: string;
    campaignName: string;
    platform: string;
    currentDailyBudgetBrl: number;
    weightedRoas: number;
    totalSpendBrl: number;
    totalConversions: number;
    dataPointDays: number;
  }>,
): string {
  const campaignLines = campaigns
    .map(
      (c) =>
        `- ID: ${c.campaignId} | Nome: "${c.campaignName}" | Plataforma: ${c.platform} | ` +
        `Orçamento diário atual: R$${c.currentDailyBudgetBrl.toFixed(2)} | ` +
        `ROAS médio ponderado: ${c.weightedRoas.toFixed(2)} | ` +
        `Gasto total (30 dias): R$${c.totalSpendBrl.toFixed(2)} | ` +
        `Conversões totais: ${c.totalConversions} | ` +
        `Dias de dados disponíveis: ${c.dataPointDays}`,
    )
    .join("\n");

  return `Você é um especialista em gestão de orçamento para campanhas de tráfego pago.
Analise o desempenho das campanhas abaixo e recomende ajustes de orçamento diário em BRL.

CAMPANHAS:
${campaignLines}

INSTRUÇÕES:
1. Para campanhas com ROAS alto (>= 3), sugira aumento de orçamento proporcional.
2. Para campanhas com ROAS baixo (< 1), sugira redução de orçamento ou manutenção.
3. Para campanhas com poucos dados (< 7 dias), seja conservador na recomendação.
4. Justifique cada recomendação em português, de forma objetiva e profissional.
5. Escreva um resumo executivo (aiSummary) sobre o portfólio como um todo.

Responda APENAS com o seguinte JSON (sem markdown, sem texto extra):
{
  "aiSummary": "string — resumo executivo do portfólio",
  "allocations": [
    {
      "campaignId": "string",
      "justification": "string — motivo da recomendação de orçamento",
      "recommendedDailyBudgetBrl": number
    }
  ]
}`;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const budgetIntelligenceService = {
  // -------------------------------------------------------------------------
  // getRecommendations
  // -------------------------------------------------------------------------

  /**
   * Analisa campanhas ativas da empresa e retorna recomendações de orçamento
   * geradas por IA (AWS Bedrock).
   *
   * Algoritmo:
   *  1. Busca todas as campanhas com status 'active' para o companyId.
   *  2. Para cada campanha, agrega métricas dos últimos 30 dias.
   *  3. Calcula ROAS médio ponderado pelo gasto.
   *  4. Determina confiança dos dados (< 7 dias = 'insufficient').
   *  5. Chama Bedrock para gerar aiSummary e justificativas por campanha.
   *  6. Retorna BudgetRecommendation completo.
   *
   * @throws {NotFoundError} se a empresa não existir.
   * @throws {ExternalServiceError} se o Bedrock falhar.
   */
  async getRecommendations(companyId: string): Promise<BudgetRecommendation> {
    // 1. Verify company exists
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true },
    });

    if (!company) {
      throw new NotFoundError(`Empresa com id '${companyId}'`);
    }

    // 2. Fetch active campaigns
    const campaigns = await prisma.adCampaign.findMany({
      where: { companyId, status: "active" },
      select: {
        id: true,
        name: true,
        platform: true,
        dailyBudgetBrl: true,
      },
    });

    const since = new Date();
    since.setDate(since.getDate() - LOOKBACK_DAYS);

    // 3. Aggregate metrics per campaign
    const campaignData = await Promise.all(
      campaigns.map(async (campaign) => {
        const snapshots = await prisma.adMetricSnapshot.findMany({
          where: {
            campaignId: campaign.id,
            collectedAt: { gte: since },
          },
          select: {
            spendBrl: true,
            roas: true,
            conversions: true,
            collectedAt: true,
          },
          orderBy: { collectedAt: "asc" },
        });

        // Calculate weighted average ROAS (weighted by spend)
        let totalSpend = 0;
        let weightedRoasSum = 0;
        let totalConversions = 0;

        for (const snap of snapshots) {
          totalSpend += snap.spendBrl;
          weightedRoasSum += snap.roas * snap.spendBrl;
          totalConversions += snap.conversions;
        }

        const weightedRoas = totalSpend > 0 ? weightedRoasSum / totalSpend : 0;

        // Count distinct calendar days with data
        const uniqueDays = new Set(
          snapshots.map((s) => s.collectedAt.toISOString().slice(0, 10)),
        ).size;

        return {
          campaignId: campaign.id,
          campaignName: campaign.name,
          platform: campaign.platform,
          currentDailyBudgetBrl: campaign.dailyBudgetBrl,
          weightedRoas,
          totalSpendBrl: totalSpend,
          totalConversions,
          dataPointDays: uniqueDays,
        };
      }),
    );

    // 4. Build Bedrock prompt and call AI
    const systemPrompt = buildBudgetPrompt(campaignData);
    const userMessage =
      "Gere as recomendações de orçamento para as campanhas listadas acima.";

    let aiResult: {
      aiSummary: string;
      allocations: Array<{
        campaignId: string;
        justification: string;
        recommendedDailyBudgetBrl: number;
      }>;
    };

    try {
      const bedrockResult = await generateTextWithBedrock(
        companyId,
        systemPrompt,
        userMessage,
      );

      // generateTextWithBedrock already tries to parse JSON from the response.
      // The parsed content lands in options[0].content when it cannot be
      // further structured, or directly as the options array.
      // We extract the raw text and re-parse to obtain our specific shape.
      const rawText =
        bedrockResult.options?.[0]?.content ??
        JSON.stringify(bedrockResult.options?.[0] ?? {});

      // Attempt to extract JSON object from the text
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error(
          `Resposta da IA não contém JSON válido. Conteúdo: ${rawText.slice(0, 300)}`,
        );
      }

      const parsed = JSON.parse(jsonMatch[0]) as typeof aiResult;

      if (
        typeof parsed.aiSummary !== "string" ||
        !Array.isArray(parsed.allocations)
      ) {
        throw new Error(
          "Resposta da IA não segue o formato esperado (aiSummary + allocations).",
        );
      }

      aiResult = parsed;

      logger.info("[budget-intelligence] Bedrock response received", {
        companyId,
        model: bedrockResult.usage.model,
        inputTokens: bedrockResult.usage.inputTokens,
        outputTokens: bedrockResult.usage.outputTokens,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("[budget-intelligence] Bedrock call failed", err, {
        companyId,
      });
      throw new ExternalServiceError("AWS Bedrock", message);
    }

    // Build a lookup map for AI per-campaign results
    const aiAllocationMap = new Map(
      aiResult.allocations.map((a) => [a.campaignId, a]),
    );

    // 5. Assemble BudgetAllocation list
    const allocations: BudgetAllocation[] = campaignData.map((c) => {
      const aiData = aiAllocationMap.get(c.campaignId);
      const recommendedBrl =
        typeof aiData?.recommendedDailyBudgetBrl === "number" &&
        aiData.recommendedDailyBudgetBrl > 0
          ? aiData.recommendedDailyBudgetBrl
          : c.currentDailyBudgetBrl; // fall back to current if AI didn't return a value

      const changePercent =
        c.currentDailyBudgetBrl > 0
          ? ((recommendedBrl - c.currentDailyBudgetBrl) /
              c.currentDailyBudgetBrl) *
            100
          : 0;

      const dataConfidence: "sufficient" | "insufficient" =
        c.dataPointDays >= MIN_CONFIDENCE_DAYS ? "sufficient" : "insufficient";

      return {
        campaignId: c.campaignId,
        campaignName: c.campaignName,
        platform: c.platform,
        currentDailyBudgetBrl: c.currentDailyBudgetBrl,
        recommendedDailyBudgetBrl: recommendedBrl,
        changePercent,
        justification:
          aiData?.justification ??
          "Dados insuficientes para justificativa detalhada.",
        dataConfidence,
      };
    });

    const totalCurrentBrl = allocations.reduce(
      (sum, a) => sum + a.currentDailyBudgetBrl,
      0,
    );
    const totalRecommendedBrl = allocations.reduce(
      (sum, a) => sum + a.recommendedDailyBudgetBrl,
      0,
    );

    logger.info("[budget-intelligence] Recommendations generated", {
      companyId,
      campaignCount: allocations.length,
      totalCurrentBrl,
      totalRecommendedBrl,
    });

    return {
      allocations,
      totalCurrentBrl,
      totalRecommendedBrl,
      generatedAt: new Date(),
      aiSummary: aiResult.aiSummary,
    };
  },

  // -------------------------------------------------------------------------
  // apply
  // -------------------------------------------------------------------------

  /**
   * Aplica alocações de orçamento aprovadas pelo usuário.
   *
   * Para cada alocação:
   *  - Se newDailyBudgetBrl <= R$500: aplica imediatamente na plataforma e
   *    registra CampaignAuditLog com actionType 'budget_updated'.
   *  - Se newDailyBudgetBrl > R$500: cria CampaignAuditLog com
   *    requiresConfirmation=true (não aplica na plataforma ainda).
   *
   * @returns { applied, pendingConfirmation } — contadores de cada grupo.
   */
  async apply(
    input: ApplyBudgetInput,
    userId: string,
  ): Promise<{ applied: number; pendingConfirmation: number }> {
    let applied = 0;
    let pendingConfirmation = 0;

    for (const allocation of input.allocations) {
      const { campaignId, newDailyBudgetBrl } = allocation;

      // Fetch campaign record
      const campaign = await prisma.adCampaign.findUnique({
        where: { id: campaignId },
        select: {
          id: true,
          companyId: true,
          platform: true,
          dailyBudgetBrl: true,
          externalAdSetId: true,
          externalCampaignId: true,
        },
      });

      if (!campaign) {
        logger.warn(
          "[budget-intelligence] apply — campanha não encontrada, pulando",
          { campaignId, userId },
        );
        continue;
      }

      if (newDailyBudgetBrl <= CONFIRMATION_THRESHOLD_BRL) {
        // ------------------------------------------------------------------
        // Apply immediately on platform
        // ------------------------------------------------------------------
        try {
          const creds = await credentialService.get(
            campaign.companyId,
            campaign.platform as "meta" | "google",
          );

          const budgetCents = Math.round(newDailyBudgetBrl * 100);

          if (campaign.platform === "meta") {
            // Meta updates budget at the Ad Set level
            const adSetId = campaign.externalAdSetId;
            if (!adSetId) {
              throw new Error(
                `Campanha ${campaignId} não possui externalAdSetId configurado.`,
              );
            }
            await metaAdsConnector.updateAdSetBudget(creds, adSetId, budgetCents);
          } else if (campaign.platform === "google") {
            // Google updates budget in micros (1 BRL = 1,000,000 micros)
            const budgetMicros = Math.round(newDailyBudgetBrl * 1_000_000);
            const externalCampaignId = campaign.externalCampaignId;
            if (!externalCampaignId) {
              throw new Error(
                `Campanha ${campaignId} não possui externalCampaignId configurado.`,
              );
            }
            await googleAdsConnector.updateCampaignBudget(
              creds,
              externalCampaignId,
              budgetMicros,
            );
          } else {
            throw new Error(
              `Plataforma não suportada para atualização de orçamento: ${campaign.platform}`,
            );
          }

          // Update stored daily budget in DB
          await prisma.adCampaign.update({
            where: { id: campaignId },
            data: { dailyBudgetBrl: newDailyBudgetBrl },
          });

          // Write audit log
          await prisma.campaignAuditLog.create({
            data: {
              companyId: campaign.companyId,
              campaignId,
              actionType: "budget_updated",
              source: "budget_manager",
              previousValues: JSON.stringify({
                dailyBudgetBrl: campaign.dailyBudgetBrl,
              }),
              newValues: JSON.stringify({
                dailyBudgetBrl: newDailyBudgetBrl,
              }),
              metadata: JSON.stringify({ userId, appliedBy: "budget_manager" }),
              requiresConfirmation: false,
            },
          });

          applied++;

          logger.info("[budget-intelligence] Budget applied", {
            campaignId,
            platform: campaign.platform,
            previousBudgetBrl: campaign.dailyBudgetBrl,
            newDailyBudgetBrl,
            userId,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          logger.error(
            "[budget-intelligence] Failed to apply budget — skipping",
            err,
            { campaignId, newDailyBudgetBrl, userId },
          );

          // Write a failed audit log so the operator can review
          try {
            await prisma.campaignAuditLog.create({
              data: {
                companyId: campaign.companyId,
                campaignId,
                actionType: "budget_updated",
                source: "budget_manager",
                previousValues: JSON.stringify({
                  dailyBudgetBrl: campaign.dailyBudgetBrl,
                }),
                newValues: JSON.stringify({
                  dailyBudgetBrl: newDailyBudgetBrl,
                }),
                metadata: JSON.stringify({
                  userId,
                  error: message,
                  status: "failed",
                }),
                requiresConfirmation: false,
              },
            });
          } catch (auditErr) {
            logger.error(
              "[budget-intelligence] Could not write failed audit log",
              auditErr,
              { campaignId },
            );
          }
        }
      } else {
        // ------------------------------------------------------------------
        // Budget > R$500 — requires human confirmation
        // ------------------------------------------------------------------
        try {
          await prisma.campaignAuditLog.create({
            data: {
              companyId: campaign.companyId,
              campaignId,
              actionType: "budget_updated",
              source: "budget_manager",
              previousValues: JSON.stringify({
                dailyBudgetBrl: campaign.dailyBudgetBrl,
              }),
              newValues: JSON.stringify({
                dailyBudgetBrl: newDailyBudgetBrl,
              }),
              metadata: JSON.stringify({
                userId,
                reason: `Orçamento acima do limite automático de R$${CONFIRMATION_THRESHOLD_BRL}`,
              }),
              requiresConfirmation: true,
              userDecision: null,
              userDecisionAt: null,
            },
          });

          pendingConfirmation++;

          logger.info("[budget-intelligence] Budget requires confirmation", {
            campaignId,
            newDailyBudgetBrl,
            threshold: CONFIRMATION_THRESHOLD_BRL,
            userId,
          });
        } catch (auditErr) {
          logger.error(
            "[budget-intelligence] Failed to create confirmation audit log",
            auditErr,
            { campaignId, newDailyBudgetBrl, userId },
          );
        }
      }
    }

    logger.info("[budget-intelligence] apply completed", {
      companyId: input.companyId,
      applied,
      pendingConfirmation,
      userId,
    });

    return { applied, pendingConfirmation };
  },
};
