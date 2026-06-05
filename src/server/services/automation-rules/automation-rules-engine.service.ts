/**
 * automation-rules-engine.service.ts
 * Evaluation logic: applies rules against metric snapshots.
 */

import { prisma } from "@server/lib/prisma";
import { logger } from "@server/lib/logger";
import { automationRulesRepository } from "@server/repositories/automation-rules.repository";
import type { AdMetricSnapshot } from "@prisma/client";
import type { AutomationRuleCondition, AutomationRuleAction, RuleEvaluationResult } from "./automation-rules.types";
import { BUDGET_CONFIRMATION_THRESHOLD_BRL } from "./automation-rules.types";

function applyOperator(metricValue: number, operator: AutomationRuleCondition["operator"], threshold: number): boolean {
  switch (operator) {
    case "gt": return metricValue > threshold;
    case "lt": return metricValue < threshold;
    case "eq": return metricValue === threshold;
  }
}

function getMetricValue(snapshot: AdMetricSnapshot, metric: AutomationRuleCondition["metric"]): number {
  switch (metric) {
    case "cpc": return snapshot.cpc;
    case "ctr": return snapshot.ctr;
    case "roas": return snapshot.roas;
    case "totalCost": return snapshot.spendBrl;
    case "conversions": return snapshot.conversions;
  }
}

export async function evaluate(
  companyId: string,
  metrics: Map<string, AdMetricSnapshot>,
): Promise<RuleEvaluationResult[]> {
  const activeRules = await automationRulesRepository.findActiveByCompany(companyId);
  const results: RuleEvaluationResult[] = [];

  for (const rule of activeRules) {
    let condition: AutomationRuleCondition;
    let action: AutomationRuleAction;
    try {
      condition = JSON.parse(rule.conditionJson) as AutomationRuleCondition;
      action = JSON.parse(rule.actionJson) as AutomationRuleAction;
    } catch (err) {
      logger.error("[automation-rules] Failed to parse rule JSON", err, { ruleId: rule.id });
      continue;
    }

    const targetCampaignIds = rule.campaignId ? [rule.campaignId] : Array.from(metrics.keys());

    for (const campaignId of targetCampaignIds) {
      const snapshot = metrics.get(campaignId);
      if (!snapshot) continue;

      const currentMetricValue = getMetricValue(snapshot, condition.metric);
      const satisfied = applyOperator(currentMetricValue, condition.operator, condition.value);

      let projectedNewBudgetBrl: number | undefined;
      let requiresConfirmation = false;

      if (action.type === "increase_budget" && action.budgetIncreasePercent !== undefined) {
        const campaign = await prisma.adCampaign.findUnique({ where: { id: campaignId }, select: { dailyBudgetBrl: true } });
        if (campaign) {
          projectedNewBudgetBrl = campaign.dailyBudgetBrl * (1 + action.budgetIncreasePercent / 100);
          requiresConfirmation = projectedNewBudgetBrl > BUDGET_CONFIRMATION_THRESHOLD_BRL;
        }
      }

      results.push({ rule, campaignId, satisfied, currentMetricValue, action, projectedNewBudgetBrl, requiresConfirmation });
    }
  }

  return results;
}
