/**
 * automation-rules.service.ts
 * Facade — delegates to decomposed sub-modules in ./automation-rules/
 */

export { automationRulesService } from "./automation-rules/index";
export type {
  AutomationRuleCondition,
  AutomationRuleAction,
  CreateRuleInput,
  RuleEvaluationResult,
  RuleExecutionOutcome,
} from "./automation-rules/automation-rules.types";
