/**
 * automation-rules.service.ts
 *
 * Service for creating, listing, evaluating and executing automation rules
 * that trigger actions on ad campaigns based on performance metrics.
 *
 * Budget threshold: actions that would push a campaign's daily budget above
 * R$500 are NOT executed immediately — they are queued as CampaignAuditLog
 * records with requiresConfirmation=true and returned as pending_confirmation.
 */

import { prisma } from "@server/lib/prisma";
import { logger } from "@server/lib/logger";
import { automationRulesRepository } from "@server/repositories/automation-rules.repository";
import { metaAdsConnector } from "@server/lib/meta-ads.connector";
import { googleAdsConnector } from "@server/lib/google-ads.connector";
import type { AutomationRule, AdMetricSnapshot } from "@prisma/client";
import type { DecryptedCredential } from "@server/services/credential.service";

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface AutomationRuleCondition {
  metric: "cpc" | "ctr" | "roas" | "totalCost" | "conversions";
  operator: "gt" | "lt" | "eq";
  value: number;
}

export interface AutomationRuleAction {
  type: "pause_ad" | "pause_adset" | "increase_budget" | "replace_creative";
  budgetIncreasePercent?: number;
}

export interface CreateRuleInput {
  companyId: string;
  campaignId?: string;
  name: string;
  condition: AutomationRuleCondition;
  action: AutomationRuleAction;
}

export interface RuleEvaluationResult {
  rule: AutomationRule;
  campaignId: string;
  satisfied: boolean;
  currentMetricValue: number;
  action: AutomationRuleAction;
  projectedNewBudgetBrl?: number;
  /** true if projectedNewBudgetBrl > 500 */
  requiresConfirmation: boolean;
}

export type RuleExecutionOutcome =
  | { status: "executed"; apiResponse: unknown }
  | { status: "pending_confirmation"; pendingAuditLogId: string }
  | { status: "failed"; error: string }
  | { status: "skipped"; reason: string };

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const BUDGET_CONFIRMATION_THRESHOLD_BRL = 500;

/**
 * Applies the rule operator to a numeric metric value.
 */
function applyOperator(
  metricValue: number,
  operator: AutomationRuleCondition["operator"],
  threshold: number,
): boolean {
  switch (operator) {
    case "gt":
      return metricValue > threshold;
    case "lt":
      return metricValue < threshold;
    case "eq":
      return metricValue === threshold;
  }
}

/**
 * Extracts the numeric value for the requested metric from a snapshot.
 * 'totalCost' maps to spendBrl on the snapshot.
 */
function getMetricValue(
  snapshot: AdMetricSnapshot,
  metric: AutomationRuleCondition["metric"],
): number {
  switch (metric) {
    case "cpc":
      return snapshot.cpc;
    case "ctr":
      return snapshot.ctr;
    case "roas":
      return snapshot.roas;
    case "totalCost":
      return snapshot.spendBrl;
    case "conversions":
      return snapshot.conversions;
  }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const automationRulesService = {
  // -------------------------------------------------------------------------
  // create
  // -------------------------------------------------------------------------

  /**
   * Creates a new automation rule for the given company.
   * Condition and action objects are serialized as JSON before persistence.
   */
  async create(input: CreateRuleInput): Promise<AutomationRule> {
    const rule = await automationRulesRepository.create({
      companyId: input.companyId,
      campaignId: input.campaignId,
      name: input.name,
      conditionJson: JSON.stringify(input.condition),
      actionJson: JSON.stringify(input.action),
    });

    logger.info("[automation-rules] Rule created", {
      ruleId: rule.id,
      companyId: input.companyId,
      campaignId: input.campaignId ?? null,
      name: input.name,
    });

    return rule;
  },

  // -------------------------------------------------------------------------
  // listByCompany
  // -------------------------------------------------------------------------

  /**
   * Returns all automation rules for a company (active and inactive).
   */
  async listByCompany(companyId: string): Promise<AutomationRule[]> {
    return automationRulesRepository.findByCompany(companyId);
  },

  // -------------------------------------------------------------------------
  // evaluate
  // -------------------------------------------------------------------------

  /**
   * Evaluates all active rules for a company against a map of current metric
   * snapshots keyed by campaignId.
   *
   * For each active rule:
   *   - If the rule targets a specific campaignId, only evaluate against that
   *     campaign's snapshot.
   *   - If the rule is global (no campaignId), evaluate against every campaign
   *     snapshot in the map.
   *   - Parses conditionJson and actionJson from the DB record.
   *   - Applies the operator to the relevant metric value.
   *   - For increase_budget actions, calculates the projected new daily budget
   *     and sets requiresConfirmation=true if it exceeds R$500.
   *
   * @param companyId  - company whose active rules to evaluate
   * @param metrics    - Map<campaignId, AdMetricSnapshot> current snapshots
   */
  async evaluate(
    companyId: string,
    metrics: Map<string, AdMetricSnapshot>,
  ): Promise<RuleEvaluationResult[]> {
    const activeRules = await automationRulesRepository.findActiveByCompany(companyId);
    const results: RuleEvaluationResult[] = [];

    for (const rule of activeRules) {
      // Parse condition and action from JSON stored in the DB
      let condition: AutomationRuleCondition;
      let action: AutomationRuleAction;

      try {
        condition = JSON.parse(rule.conditionJson) as AutomationRuleCondition;
        action = JSON.parse(rule.actionJson) as AutomationRuleAction;
      } catch (err) {
        logger.error("[automation-rules] Failed to parse rule JSON", err, {
          ruleId: rule.id,
        });
        continue;
      }

      // Determine which campaign IDs this rule applies to
      const targetCampaignIds: string[] =
        rule.campaignId
          ? [rule.campaignId]
          : Array.from(metrics.keys());

      for (const campaignId of targetCampaignIds) {
        const snapshot = metrics.get(campaignId);
        if (!snapshot) {
          // No snapshot available for this campaign — skip silently
          continue;
        }

        const currentMetricValue = getMetricValue(snapshot, condition.metric);
        const satisfied = applyOperator(
          currentMetricValue,
          condition.operator,
          condition.value,
        );

        // Calculate projected budget for increase_budget actions
        let projectedNewBudgetBrl: number | undefined;
        let requiresConfirmation = false;

        if (action.type === "increase_budget" && action.budgetIncreasePercent !== undefined) {
          // Fetch the current campaign to get its dailyBudgetBrl
          const campaign = await prisma.adCampaign.findUnique({
            where: { id: campaignId },
            select: { dailyBudgetBrl: true },
          });

          if (campaign) {
            projectedNewBudgetBrl =
              campaign.dailyBudgetBrl * (1 + action.budgetIncreasePercent / 100);
            requiresConfirmation =
              projectedNewBudgetBrl > BUDGET_CONFIRMATION_THRESHOLD_BRL;
          }
        }

        results.push({
          rule,
          campaignId,
          satisfied,
          currentMetricValue,
          action,
          projectedNewBudgetBrl,
          requiresConfirmation,
        });
      }
    }

    return results;
  },

  // -------------------------------------------------------------------------
  // execute
  // -------------------------------------------------------------------------

  /**
   * Executes a single rule evaluation result against the ad platform.
   *
   * Only called when result.satisfied === true by the caller.
   *
   * - pause_ad:        calls connector.pauseAd, logs execution
   * - pause_adset:     calls connector.pauseAdSet (Meta) or connector.pauseAd
   *                    (Google — no dedicated pauseAdSet), logs execution
   * - increase_budget (≤R$500): calls connector to update budget, logs execution
   * - increase_budget (>R$500): creates CampaignAuditLog with
   *                    requiresConfirmation=true, returns pending_confirmation
   * - replace_creative: creates CampaignAuditLog notifying the user, returns
   *                    pending_confirmation
   *
   * Execution is only logged (RuleExecutionLog) AFTER the API call succeeds.
   * On error: logs via logger.error, logs a failed execution, returns failed.
   */
  async execute(
    result: RuleEvaluationResult,
    creds: DecryptedCredential,
  ): Promise<RuleExecutionOutcome> {
    const { rule, campaignId, action, projectedNewBudgetBrl, requiresConfirmation } = result;

    // Fetch campaign details needed for connectors
    const campaign = await prisma.adCampaign.findUnique({
      where: { id: campaignId },
      select: {
        id: true,
        companyId: true,
        platform: true,
        dailyBudgetBrl: true,
        externalCampaignId: true,
        externalAdSetId: true,
        externalAdIds: true,
      },
    });

    if (!campaign) {
      const reason = `Campaign ${campaignId} not found`;
      await automationRulesRepository.logExecution({
        ruleId: rule.id,
        campaignId,
        triggered: true,
        outcome: "skipped",
        errorMsg: reason,
      });
      return { status: "skipped", reason };
    }

    const platform = campaign.platform as "meta" | "google";

    try {
      switch (action.type) {
        // ------------------------------------------------------------------
        // pause_ad
        // ------------------------------------------------------------------
        case "pause_ad": {
          // Use the first external ad ID available
          let externalAdIds: string[] = [];
          if (campaign.externalAdIds) {
            try {
              externalAdIds = JSON.parse(campaign.externalAdIds) as string[];
            } catch {
              externalAdIds = [];
            }
          }

          const externalAdId = externalAdIds[0] ?? campaign.externalCampaignId ?? "";

          if (!externalAdId) {
            const reason = "No externalAdId available for pause_ad action";
            await automationRulesRepository.logExecution({
              ruleId: rule.id,
              campaignId,
              triggered: true,
              outcome: "skipped",
              errorMsg: reason,
            });
            return { status: "skipped", reason };
          }

          if (platform === "meta") {
            await metaAdsConnector.pauseAd(creds, externalAdId);
          } else {
            await googleAdsConnector.pauseAd(creds, externalAdId);
          }

          const apiResponse = { action: "pause_ad", externalAdId, platform };
          await automationRulesRepository.logExecution({
            ruleId: rule.id,
            campaignId,
            triggered: true,
            outcome: "executed",
            apiResponse: JSON.stringify(apiResponse),
          });

          logger.info("[automation-rules] pause_ad executed", {
            ruleId: rule.id,
            campaignId,
            externalAdId,
            platform,
          });

          return { status: "executed", apiResponse };
        }

        // ------------------------------------------------------------------
        // pause_adset
        // ------------------------------------------------------------------
        case "pause_adset": {
          const externalAdSetId = campaign.externalAdSetId;

          if (!externalAdSetId) {
            const reason = "No externalAdSetId available for pause_adset action";
            await automationRulesRepository.logExecution({
              ruleId: rule.id,
              campaignId,
              triggered: true,
              outcome: "skipped",
              errorMsg: reason,
            });
            return { status: "skipped", reason };
          }

          if (platform === "meta") {
            await metaAdsConnector.pauseAdSet(creds, externalAdSetId);
          } else {
            // Google Ads doesn't expose a separate pauseAdSet — pause via pauseAd
            // using the ad group resource name (treated as ad-level by the connector)
            await googleAdsConnector.pauseAd(creds, externalAdSetId);
          }

          const apiResponse = { action: "pause_adset", externalAdSetId, platform };
          await automationRulesRepository.logExecution({
            ruleId: rule.id,
            campaignId,
            triggered: true,
            outcome: "executed",
            apiResponse: JSON.stringify(apiResponse),
          });

          logger.info("[automation-rules] pause_adset executed", {
            ruleId: rule.id,
            campaignId,
            externalAdSetId,
            platform,
          });

          return { status: "executed", apiResponse };
        }

        // ------------------------------------------------------------------
        // increase_budget
        // ------------------------------------------------------------------
        case "increase_budget": {
          // Budget above threshold → requires human confirmation
          if (requiresConfirmation && projectedNewBudgetBrl !== undefined) {
            const auditLog = await prisma.campaignAuditLog.create({
              data: {
                companyId: campaign.companyId,
                campaignId,
                actionType: "budget_increased",
                source: "rule_engine",
                previousValues: JSON.stringify({
                  dailyBudgetBrl: campaign.dailyBudgetBrl,
                }),
                newValues: JSON.stringify({
                  dailyBudgetBrl: projectedNewBudgetBrl,
                }),
                metadata: JSON.stringify({
                  ruleId: rule.id,
                  ruleName: rule.name,
                  budgetIncreasePercent: action.budgetIncreasePercent,
                  projectedNewBudgetBrl,
                }),
                requiresConfirmation: true,
              },
            });

            await automationRulesRepository.logExecution({
              ruleId: rule.id,
              campaignId,
              triggered: true,
              outcome: "pending_confirmation",
              apiResponse: JSON.stringify({ auditLogId: auditLog.id }),
            });

            logger.info("[automation-rules] increase_budget pending confirmation", {
              ruleId: rule.id,
              campaignId,
              projectedNewBudgetBrl,
              auditLogId: auditLog.id,
            });

            return {
              status: "pending_confirmation",
              pendingAuditLogId: auditLog.id,
            };
          }

          // Budget within threshold → execute immediately
          const budgetIncreasePercent = action.budgetIncreasePercent ?? 0;
          const newBudgetBrl =
            projectedNewBudgetBrl ??
            campaign.dailyBudgetBrl * (1 + budgetIncreasePercent / 100);

          if (platform === "meta") {
            const externalAdSetId = campaign.externalAdSetId;
            if (!externalAdSetId) {
              const reason = "No externalAdSetId for increase_budget on Meta";
              await automationRulesRepository.logExecution({
                ruleId: rule.id,
                campaignId,
                triggered: true,
                outcome: "skipped",
                errorMsg: reason,
              });
              return { status: "skipped", reason };
            }
            const dailyBudgetCents = Math.round(newBudgetBrl * 100);
            await metaAdsConnector.updateAdSetBudget(
              creds,
              externalAdSetId,
              dailyBudgetCents,
            );
          } else {
            const externalCampaignId = campaign.externalCampaignId;
            if (!externalCampaignId) {
              const reason = "No externalCampaignId for increase_budget on Google";
              await automationRulesRepository.logExecution({
                ruleId: rule.id,
                campaignId,
                triggered: true,
                outcome: "skipped",
                errorMsg: reason,
              });
              return { status: "skipped", reason };
            }
            const dailyBudgetMicros = Math.round(newBudgetBrl * 1_000_000);
            await googleAdsConnector.updateCampaignBudget(
              creds,
              externalCampaignId,
              dailyBudgetMicros,
            );
          }

          const apiResponse = {
            action: "increase_budget",
            previousBudgetBrl: campaign.dailyBudgetBrl,
            newBudgetBrl,
            platform,
          };

          await automationRulesRepository.logExecution({
            ruleId: rule.id,
            campaignId,
            triggered: true,
            outcome: "executed",
            apiResponse: JSON.stringify(apiResponse),
          });

          logger.info("[automation-rules] increase_budget executed", {
            ruleId: rule.id,
            campaignId,
            previousBudgetBrl: campaign.dailyBudgetBrl,
            newBudgetBrl,
            platform,
          });

          return { status: "executed", apiResponse };
        }

        // ------------------------------------------------------------------
        // replace_creative
        // ------------------------------------------------------------------
        case "replace_creative": {
          // Creative replacement always requires a human to upload new assets
          const auditLog = await prisma.campaignAuditLog.create({
            data: {
              companyId: campaign.companyId,
              campaignId,
              actionType: "creative_replacement_requested",
              source: "rule_engine",
              metadata: JSON.stringify({
                ruleId: rule.id,
                ruleName: rule.name,
                message:
                  "Regra de automação solicitou substituição de criativo. " +
                  "Por favor, envie um novo criativo para esta campanha.",
              }),
              requiresConfirmation: true,
            },
          });

          await automationRulesRepository.logExecution({
            ruleId: rule.id,
            campaignId,
            triggered: true,
            outcome: "pending_confirmation",
            apiResponse: JSON.stringify({ auditLogId: auditLog.id }),
          });

          logger.info("[automation-rules] replace_creative pending confirmation", {
            ruleId: rule.id,
            campaignId,
            auditLogId: auditLog.id,
          });

          return {
            status: "pending_confirmation",
            pendingAuditLogId: auditLog.id,
          };
        }

        default: {
          const reason = `Unknown action type: ${(action as AutomationRuleAction).type}`;
          await automationRulesRepository.logExecution({
            ruleId: rule.id,
            campaignId,
            triggered: true,
            outcome: "skipped",
            errorMsg: reason,
          });
          return { status: "skipped", reason };
        }
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);

      logger.error("[automation-rules] Rule execution failed", err, {
        ruleId: rule.id,
        campaignId,
        actionType: action.type,
        platform,
      });

      // Log the failed execution
      try {
        await automationRulesRepository.logExecution({
          ruleId: rule.id,
          campaignId,
          triggered: true,
          outcome: "failed",
          errorMsg,
        });
      } catch (logErr) {
        logger.error(
          "[automation-rules] Failed to log failed execution",
          logErr,
          { ruleId: rule.id, campaignId },
        );
      }

      return { status: "failed", error: errorMsg };
    }
  },
};
