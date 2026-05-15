/**
 * automation-rules.repository.ts
 *
 * Data access layer for AutomationRule and RuleExecutionLog models.
 */

import { prisma } from "@server/lib/prisma";
import type { AutomationRule, RuleExecutionLog } from "@prisma/client";

export const automationRulesRepository = {
  /**
   * Creates a new AutomationRule record.
   */
  create(data: {
    companyId: string;
    campaignId?: string;
    name: string;
    conditionJson: string;
    actionJson: string;
  }): Promise<AutomationRule> {
    return prisma.automationRule.create({
      data: {
        companyId: data.companyId,
        campaignId: data.campaignId ?? null,
        name: data.name,
        conditionJson: data.conditionJson,
        actionJson: data.actionJson,
        isActive: true,
      },
    });
  },

  /**
   * Returns all active rules for the given company (isActive = true).
   */
  findActiveByCompany(companyId: string): Promise<AutomationRule[]> {
    return prisma.automationRule.findMany({
      where: { companyId, isActive: true },
      orderBy: { createdAt: "asc" },
    });
  },

  /**
   * Returns ALL rules for the given company regardless of isActive state.
   */
  findByCompany(companyId: string): Promise<AutomationRule[]> {
    return prisma.automationRule.findMany({
      where: { companyId },
      orderBy: { createdAt: "asc" },
    });
  },

  /**
   * Logs a single rule evaluation/execution.
   */
  logExecution(data: {
    ruleId: string;
    campaignId: string;
    triggered: boolean;
    outcome: string;
    errorMsg?: string;
    apiResponse?: string;
  }): Promise<RuleExecutionLog> {
    return prisma.ruleExecutionLog.create({
      data: {
        ruleId: data.ruleId,
        campaignId: data.campaignId,
        triggered: data.triggered,
        outcome: data.outcome,
        errorMsg: data.errorMsg ?? null,
        apiResponse: data.apiResponse ?? null,
      },
    });
  },
};
