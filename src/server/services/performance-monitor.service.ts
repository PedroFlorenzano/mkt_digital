/**
 * performance-monitor.service.ts
 *
 * Periodic performance monitoring service for AI Paid Traffic campaigns.
 *
 * Responsibilities:
 *  1. Collect metrics snapshots from Meta/Google connectors (collectMetrics)
 *  2. Generate AI performance reports in Portuguese via AWS Bedrock (generatePerformanceReport)
 *  3. Orchestrate a full monitor cycle: collect → evaluate rules → finalize A/B tests → report (runCycle)
 *
 * Lazy/deferred imports are used for automationRulesService and abTestService
 * to avoid circular dependency issues.
 */

import { prisma } from "@server/lib/prisma";
import { generateTextWithBedrock } from "@server/lib/bedrock";
import { logger } from "@server/lib/logger";
import { metaAdsConnector } from "@server/lib/meta-ads.connector";
import { googleAdsConnector } from "@server/lib/google-ads.connector";
import { credentialService } from "@server/services/credential.service";
import type { DecryptedCredential } from "@server/services/credential.service";
import type { AdCampaign, AdMetricSnapshot } from "@prisma/client";

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

export interface MonitorCycleResult {
  companiesProcessed: number;
  campaignsChecked: number;
  snapshotsSaved: number;
  /** IDs of campaigns that failed collection */
  campaignsFailed: string[];
  rulesEvaluated: number;
  actionsExecuted: number;
  abTestsFinalized: number;
  reportsGenerated: number;
}

// ---------------------------------------------------------------------------
// Lazy service imports (deferred to avoid circular dependencies)
// ---------------------------------------------------------------------------

// TODO: Import automationRulesService once @server/services/automation-rules.service is created.
// import { automationRulesService } from "@server/services/automation-rules.service";

// TODO: Import abTestService once @server/services/ab-test.service is created.
// import { abTestService } from "@server/services/ab-test.service";

// ---------------------------------------------------------------------------
// Service implementation
// ---------------------------------------------------------------------------

export const performanceMonitorService = {
  /**
   * Collects metrics for a single campaign over the last 6 hours and
   * persists an AdMetricSnapshot to the database.
   *
   * - Calls `getMetrics` on the appropriate connector (meta or google).
   * - Persists the resulting snapshot via Prisma.
   * - On any error: logs via logger.error and returns null WITHOUT throwing,
   *   so the caller can continue processing other campaigns.
   *
   * @param campaign  The AdCampaign record to collect metrics for.
   * @param creds     Decrypted platform credentials.
   * @returns         The persisted AdMetricSnapshot, or null on failure.
   */
  async collectMetrics(
    campaign: AdCampaign,
    creds: DecryptedCredential,
  ): Promise<AdMetricSnapshot | null> {
    const now = new Date();
    const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);

    const periodStart = sixHoursAgo;
    const periodEnd = now;

    let rawMetrics: {
      impressions: number;
      clicks: number;
      conversions: number;
      spendBrl: number;
      ctr: number;
      cpc: number;
      roas: number;
      rawJson: string;
    };

    try {
      if (campaign.platform === "meta") {
        rawMetrics = await metaAdsConnector.getMetrics(
          creds,
          campaign.externalCampaignId ?? campaign.id,
          periodStart,
          periodEnd,
        );
      } else {
        // google
        rawMetrics = await googleAdsConnector.getMetrics(
          creds,
          campaign.externalCampaignId ?? campaign.id,
          periodStart,
          periodEnd,
        );
      }
    } catch (err) {
      logger.error(
        "[performance-monitor] Failed to fetch metrics from platform API",
        err,
        {
          campaignId: campaign.id,
          platform: campaign.platform,
          externalCampaignId: campaign.externalCampaignId ?? undefined,
        },
      );
      return null;
    }

    try {
      const snapshot = await prisma.adMetricSnapshot.create({
        data: {
          campaignId: campaign.id,
          collectedAt: now,
          periodStart,
          periodEnd,
          impressions: rawMetrics.impressions,
          clicks: rawMetrics.clicks,
          conversions: rawMetrics.conversions,
          spendBrl: rawMetrics.spendBrl,
          ctr: rawMetrics.ctr,
          cpc: rawMetrics.cpc,
          roas: rawMetrics.roas,
          rawJson: rawMetrics.rawJson,
        },
      });

      logger.info("[performance-monitor] Snapshot saved", {
        campaignId: campaign.id,
        snapshotId: snapshot.id,
        spendBrl: rawMetrics.spendBrl,
        impressions: rawMetrics.impressions,
      });

      return snapshot;
    } catch (err) {
      logger.error(
        "[performance-monitor] Failed to persist AdMetricSnapshot",
        err,
        { campaignId: campaign.id },
      );
      return null;
    }
  },

  /**
   * Generates an AI performance report in Portuguese for a company's snapshots.
   *
   * Builds a prompt summarising: total spend, conversions, cost per conversion,
   * and ROAS. Calls generateTextWithBedrock and returns the raw text response.
   *
   * @param companyId  ID of the company — used for Bedrock cost logging.
   * @param snapshots  Array of AdMetricSnapshot records to include in the report.
   * @returns          The generated text report.
   */
  async generatePerformanceReport(
    companyId: string,
    snapshots: AdMetricSnapshot[],
  ): Promise<string> {
    // Aggregate metrics across all snapshots
    const totalSpend = snapshots.reduce((sum, s) => sum + s.spendBrl, 0);
    const totalConversions = snapshots.reduce((sum, s) => sum + s.conversions, 0);
    const totalImpressions = snapshots.reduce((sum, s) => sum + s.impressions, 0);
    const totalClicks = snapshots.reduce((sum, s) => sum + s.clicks, 0);
    const avgRoas =
      snapshots.length > 0
        ? snapshots.reduce((sum, s) => sum + s.roas, 0) / snapshots.length
        : 0;

    const costPerConversion =
      totalConversions > 0 ? totalSpend / totalConversions : 0;

    const systemPrompt = `Você é um especialista em tráfego pago e marketing de performance.
Analise os dados de métricas de campanhas de anúncios pagos e gere um relatório de performance completo em português.
Seja objetivo, destaque pontos fortes, pontos de atenção e recomendações práticas de otimização.`;

    const userMessage = `Gere um relatório de performance para as campanhas monitoradas com base nos seguintes dados agregados:

**Resumo do período monitorado:**
- Total de snapshots analisados: ${snapshots.length}
- Impressões totais: ${totalImpressions.toLocaleString("pt-BR")}
- Cliques totais: ${totalClicks.toLocaleString("pt-BR")}
- Investimento total (BRL): R$ ${totalSpend.toFixed(2)}
- Conversões totais: ${totalConversions}
- Custo por conversão: R$ ${costPerConversion.toFixed(2)}
- ROAS médio: ${avgRoas.toFixed(2)}x

**Dados individuais das campanhas (últimas ${snapshots.length} coletas):**
${snapshots
  .map(
    (s, i) =>
      `${i + 1}. Campanha ${s.campaignId} — Gasto: R$ ${s.spendBrl.toFixed(2)}, ` +
      `Cliques: ${s.clicks}, Conversões: ${s.conversions}, ROAS: ${s.roas.toFixed(2)}x, ` +
      `CTR: ${(s.ctr * 100).toFixed(2)}%`,
  )
  .join("\n")}

Por favor, inclua no relatório:
1. Análise geral de performance
2. Métricas-chave e interpretação
3. Pontos de atenção (campanhas com ROAS abaixo do esperado, alto CPC, etc.)
4. Recomendações de otimização prioritárias`;

    const result = await generateTextWithBedrock(
      companyId,
      systemPrompt,
      userMessage,
    );

    // Extract text content from the Bedrock response
    const firstOption = result.options?.[0];
    const reportText = firstOption?.content ?? "";

    logger.info("[performance-monitor] Performance report generated", {
      companyId,
      snapshotsCount: snapshots.length,
      model: result.usage.model,
      costUsd: result.usage.costUsd,
    });

    return reportText;
  },

  /**
   * Runs a full monitoring cycle:
   *
   *  1. Fetches all active campaigns grouped by company (includes company and credential).
   *  2. For each campaign:
   *     - Retrieves credentials via credentialService.get
   *     - Calls collectMetrics — tracks successes and failures
   *     - Does NOT stop the cycle if a single campaign fails
   *  3. After collection:
   *     - Calls automationRulesService.evaluate + execute for successful metrics
   *     - Calls abTestService.checkAndFinalize for active A/B tests
   *     - Generates a performance report for each company if any collection succeeded
   *  4. Returns a MonitorCycleResult summary.
   */
  async runCycle(): Promise<MonitorCycleResult> {
    const result: MonitorCycleResult = {
      companiesProcessed: 0,
      campaignsChecked: 0,
      snapshotsSaved: 0,
      campaignsFailed: [],
      rulesEvaluated: 0,
      actionsExecuted: 0,
      abTestsFinalized: 0,
      reportsGenerated: 0,
    };

    // 1. Fetch all active campaigns, including their company and credential
    const activeCampaigns = await prisma.adCampaign.findMany({
      where: { status: "active" },
      include: {
        company: true,
        credential: true,
      },
    });

    if (activeCampaigns.length === 0) {
      logger.info("[performance-monitor] runCycle — no active campaigns found");
      return result;
    }

    // Group campaigns by companyId for per-company processing
    const byCompany = new Map<string, typeof activeCampaigns>();
    for (const campaign of activeCampaigns) {
      const existing = byCompany.get(campaign.companyId) ?? [];
      existing.push(campaign);
      byCompany.set(campaign.companyId, existing);
    }

    result.companiesProcessed = byCompany.size;

    // 2. Process each company's campaigns
    for (const [companyId, campaigns] of byCompany) {
      const successfulSnapshots: AdMetricSnapshot[] = [];

      for (const campaign of campaigns) {
        result.campaignsChecked++;

        // Retrieve decrypted credentials for this platform
        let creds: DecryptedCredential;
        try {
          creds = await credentialService.get(
            companyId,
            campaign.platform as "meta" | "google",
          );
        } catch (err) {
          logger.error(
            "[performance-monitor] Could not retrieve credentials for campaign",
            err,
            { campaignId: campaign.id, companyId, platform: campaign.platform },
          );
          result.campaignsFailed.push(campaign.id);
          continue;
        }

        // Collect metrics — returns null on any error (does not throw)
        const snapshot = await this.collectMetrics(campaign, creds);

        if (snapshot !== null) {
          successfulSnapshots.push(snapshot);
          result.snapshotsSaved++;
        } else {
          result.campaignsFailed.push(campaign.id);
        }
      }

      // 3a. Evaluate and execute automation rules for successful snapshots
      // TODO: Implement when @server/services/automation-rules.service is created.
      // if (successfulSnapshots.length > 0 && automationRulesService != null) {
      //   for (const snapshot of successfulSnapshots) {
      //     const evaluated = await automationRulesService.evaluate(snapshot);
      //     result.rulesEvaluated += evaluated.rulesChecked ?? 0;
      //     const executed = await automationRulesService.execute(evaluated);
      //     result.actionsExecuted += executed.actionsExecuted ?? 0;
      //   }
      // }

      // 3b. Check and finalize active A/B tests for this company
      // TODO: Implement when @server/services/ab-test.service is created.
      // if (abTestService != null) {
      //   const finalized = await abTestService.checkAndFinalize(companyId);
      //   result.abTestsFinalized += finalized ?? 0;
      // }

      // 3c. Generate performance report if at least one snapshot was collected
      if (successfulSnapshots.length > 0) {
        try {
          await this.generatePerformanceReport(companyId, successfulSnapshots);
          result.reportsGenerated++;
        } catch (err) {
          logger.error(
            "[performance-monitor] Failed to generate performance report",
            err,
            { companyId, snapshotsCount: successfulSnapshots.length },
          );
          // Non-fatal — report generation failure does not affect snapshotsSaved count
        }
      }
    }

    logger.info("[performance-monitor] runCycle complete", {
      companiesProcessed: result.companiesProcessed,
      campaignsChecked: result.campaignsChecked,
      snapshotsSaved: result.snapshotsSaved,
      campaignsFailed: result.campaignsFailed.length,
      rulesEvaluated: result.rulesEvaluated,
      actionsExecuted: result.actionsExecuted,
      abTestsFinalized: result.abTestsFinalized,
      reportsGenerated: result.reportsGenerated,
    });

    return result;
  },
};
