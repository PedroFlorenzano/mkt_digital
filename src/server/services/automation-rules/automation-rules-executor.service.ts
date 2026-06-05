/**
 * automation-rules-executor.service.ts
 * Executes rule actions against ad platforms.
 */

import { prisma } from "@server/lib/prisma";
import { logger } from "@server/lib/logger";
import { automationRulesRepository } from "@server/repositories/automation-rules.repository";
import { metaAdsConnector } from "@server/lib/meta-ads.connector";
import { googleAdsConnector } from "@server/lib/google-ads.connector";
import type { DecryptedCredential } from "@server/services/credential.service";
import type { RuleEvaluationResult, RuleExecutionOutcome } from "./automation-rules.types";

export async function execute(
  result: RuleEvaluationResult,
  creds: DecryptedCredential,
): Promise<RuleExecutionOutcome> {
  const { rule, campaignId, action, projectedNewBudgetBrl, requiresConfirmation } = result;

  const campaign = await prisma.adCampaign.findUnique({
    where: { id: campaignId },
    select: { id: true, companyId: true, platform: true, dailyBudgetBrl: true, externalCampaignId: true, externalAdSetId: true, externalAdIds: true },
  });

  if (!campaign) {
    const reason = `Campaign ${campaignId} not found`;
    await automationRulesRepository.logExecution({ ruleId: rule.id, campaignId, triggered: true, outcome: "skipped", errorMsg: reason });
    return { status: "skipped", reason };
  }

  const platform = campaign.platform as "meta" | "google";

  try {
    switch (action.type) {
      case "pause_ad": {
        let externalAdIds: string[] = [];
        try { externalAdIds = JSON.parse(campaign.externalAdIds ?? "[]") as string[]; } catch { /* empty */ }
        const externalAdId = externalAdIds[0] ?? campaign.externalCampaignId ?? "";
        if (!externalAdId) {
          const reason = "No externalAdId available for pause_ad";
          await automationRulesRepository.logExecution({ ruleId: rule.id, campaignId, triggered: true, outcome: "skipped", errorMsg: reason });
          return { status: "skipped", reason };
        }
        if (platform === "meta") await metaAdsConnector.pauseAd(creds, externalAdId);
        else await googleAdsConnector.pauseAd(creds, externalAdId);
        const apiResponse = { action: "pause_ad", externalAdId, platform };
        await automationRulesRepository.logExecution({ ruleId: rule.id, campaignId, triggered: true, outcome: "executed", apiResponse: JSON.stringify(apiResponse) });
        logger.info("[automation-rules] pause_ad executed", { ruleId: rule.id, campaignId, externalAdId });
        return { status: "executed", apiResponse };
      }

      case "pause_adset": {
        const externalAdSetId = campaign.externalAdSetId;
        if (!externalAdSetId) {
          const reason = "No externalAdSetId for pause_adset";
          await automationRulesRepository.logExecution({ ruleId: rule.id, campaignId, triggered: true, outcome: "skipped", errorMsg: reason });
          return { status: "skipped", reason };
        }
        if (platform === "meta") await metaAdsConnector.pauseAdSet(creds, externalAdSetId);
        else await googleAdsConnector.pauseAd(creds, externalAdSetId);
        const apiResponse = { action: "pause_adset", externalAdSetId, platform };
        await automationRulesRepository.logExecution({ ruleId: rule.id, campaignId, triggered: true, outcome: "executed", apiResponse: JSON.stringify(apiResponse) });
        logger.info("[automation-rules] pause_adset executed", { ruleId: rule.id, campaignId, externalAdSetId });
        return { status: "executed", apiResponse };
      }

      case "increase_budget": {
        if (requiresConfirmation && projectedNewBudgetBrl !== undefined) {
          const auditLog = await prisma.campaignAuditLog.create({
            data: {
              companyId: campaign.companyId, campaignId, actionType: "budget_increased", source: "rule_engine",
              previousValues: JSON.stringify({ dailyBudgetBrl: campaign.dailyBudgetBrl }),
              newValues: JSON.stringify({ dailyBudgetBrl: projectedNewBudgetBrl }),
              metadata: JSON.stringify({ ruleId: rule.id, ruleName: rule.name, projectedNewBudgetBrl }),
              requiresConfirmation: true,
            },
          });
          await automationRulesRepository.logExecution({ ruleId: rule.id, campaignId, triggered: true, outcome: "pending_confirmation", apiResponse: JSON.stringify({ auditLogId: auditLog.id }) });
          logger.info("[automation-rules] increase_budget pending", { ruleId: rule.id, campaignId, projectedNewBudgetBrl });
          return { status: "pending_confirmation", pendingAuditLogId: auditLog.id };
        }

        const budgetIncreasePercent = action.budgetIncreasePercent ?? 0;
        const newBudgetBrl = projectedNewBudgetBrl ?? campaign.dailyBudgetBrl * (1 + budgetIncreasePercent / 100);

        if (platform === "meta") {
          const externalAdSetId = campaign.externalAdSetId;
          if (!externalAdSetId) {
            const reason = "No externalAdSetId for increase_budget on Meta";
            await automationRulesRepository.logExecution({ ruleId: rule.id, campaignId, triggered: true, outcome: "skipped", errorMsg: reason });
            return { status: "skipped", reason };
          }
          await metaAdsConnector.updateAdSetBudget(creds, externalAdSetId, Math.round(newBudgetBrl * 100));
        } else {
          const externalCampaignId = campaign.externalCampaignId;
          if (!externalCampaignId) {
            const reason = "No externalCampaignId for increase_budget on Google";
            await automationRulesRepository.logExecution({ ruleId: rule.id, campaignId, triggered: true, outcome: "skipped", errorMsg: reason });
            return { status: "skipped", reason };
          }
          await googleAdsConnector.updateCampaignBudget(creds, externalCampaignId, Math.round(newBudgetBrl * 1_000_000));
        }

        const apiResponse = { action: "increase_budget", previousBudgetBrl: campaign.dailyBudgetBrl, newBudgetBrl, platform };
        await automationRulesRepository.logExecution({ ruleId: rule.id, campaignId, triggered: true, outcome: "executed", apiResponse: JSON.stringify(apiResponse) });
        logger.info("[automation-rules] increase_budget executed", { ruleId: rule.id, campaignId, newBudgetBrl });
        return { status: "executed", apiResponse };
      }

      case "replace_creative": {
        const auditLog = await prisma.campaignAuditLog.create({
          data: {
            companyId: campaign.companyId, campaignId, actionType: "creative_replacement_requested", source: "rule_engine",
            metadata: JSON.stringify({ ruleId: rule.id, ruleName: rule.name, message: "Regra de automação solicitou substituição de criativo." }),
            requiresConfirmation: true,
          },
        });
        await automationRulesRepository.logExecution({ ruleId: rule.id, campaignId, triggered: true, outcome: "pending_confirmation", apiResponse: JSON.stringify({ auditLogId: auditLog.id }) });
        logger.info("[automation-rules] replace_creative pending", { ruleId: rule.id, campaignId, auditLogId: auditLog.id });
        return { status: "pending_confirmation", pendingAuditLogId: auditLog.id };
      }

      default: {
        const reason = `Unknown action type: ${(action as { type: string }).type}`;
        await automationRulesRepository.logExecution({ ruleId: rule.id, campaignId, triggered: true, outcome: "skipped", errorMsg: reason });
        return { status: "skipped", reason };
      }
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error("[automation-rules] Execution failed", err, { ruleId: rule.id, campaignId, actionType: action.type });
    try { await automationRulesRepository.logExecution({ ruleId: rule.id, campaignId, triggered: true, outcome: "failed", errorMsg }); } catch { /* silent */ }
    return { status: "failed", error: errorMsg };
  }
}
