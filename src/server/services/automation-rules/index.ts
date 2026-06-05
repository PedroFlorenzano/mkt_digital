/**
 * automation-rules/index.ts
 * Barrel — re-exports the automationRulesService facade.
 */

export type {
  AutomationRuleCondition,
  AutomationRuleAction,
  CreateRuleInput,
  RuleEvaluationResult,
  RuleExecutionOutcome,
} from "./automation-rules.types";

import { logger } from "@server/lib/logger";
import { automationRulesRepository } from "@server/repositories/automation-rules.repository";
import type { AutomationRule } from "@prisma/client";
import type { CreateRuleInput } from "./automation-rules.types";
import { evaluate } from "./automation-rules-engine.service";
import { execute } from "./automation-rules-executor.service";

export const automationRulesService = {
  async create(input: CreateRuleInput): Promise<AutomationRule> {
    const rule = await automationRulesRepository.create({
      companyId: input.companyId,
      campaignId: input.campaignId,
      name: input.name,
      conditionJson: JSON.stringify(input.condition),
      actionJson: JSON.stringify(input.action),
    });
    logger.info("[automation-rules] Rule created", { ruleId: rule.id, companyId: input.companyId, name: input.name });
    return rule;
  },

  async listByCompany(companyId: string): Promise<AutomationRule[]> {
    return automationRulesRepository.findByCompany(companyId);
  },

  evaluate,
  execute,
};
