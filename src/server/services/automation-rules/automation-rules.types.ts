/**
 * automation-rules.types.ts
 * Shared types for the automation rules module.
 */

import type { AutomationRule } from "@prisma/client";

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
  requiresConfirmation: boolean;
}

export type RuleExecutionOutcome =
  | { status: "executed"; apiResponse: unknown }
  | { status: "pending_confirmation"; pendingAuditLogId: string }
  | { status: "failed"; error: string }
  | { status: "skipped"; reason: string };

export const BUDGET_CONFIRMATION_THRESHOLD_BRL = 500;
