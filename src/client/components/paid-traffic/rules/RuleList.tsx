"use client";

import { Badge } from "@client/components/ui/badge";

export interface AutomationRule {
  id: string;
  name: string;
  isActive: boolean;
  conditionJson: string; // JSON { metric, operator, value }
  actionJson: string; // JSON { type, budgetIncreasePercent? }
  campaignId?: string | null;
  createdAt: string;
}

interface RuleCondition {
  metric: string;
  operator: string;
  value: number;
}

interface RuleAction {
  type: string;
  budgetIncreasePercent?: number;
}

const METRIC_LABELS: Record<string, string> = {
  cpc: "CPC",
  ctr: "CTR",
  roas: "ROAS",
  totalCost: "Custo Total",
  conversions: "Conversões",
};

const OPERATOR_LABELS: Record<string, string> = {
  gt: "maior que",
  lt: "menor que",
  eq: "igual a",
};

const ACTION_LABELS: Record<string, string> = {
  pause_ad: "Pausar Anúncio",
  pause_adset: "Pausar Ad Set",
  increase_budget: "Aumentar Orçamento",
  replace_creative: "Substituir Criativo",
};

function formatCondition(conditionJson: string): string {
  try {
    const c = JSON.parse(conditionJson) as RuleCondition;
    const metric = METRIC_LABELS[c.metric] ?? c.metric;
    const operator = OPERATOR_LABELS[c.operator] ?? c.operator;
    const value = typeof c.value === "number" ? c.value.toFixed(2) : c.value;
    return `${metric} ${operator} ${value}`;
  } catch {
    return conditionJson;
  }
}

function formatAction(actionJson: string): string {
  try {
    const a = JSON.parse(actionJson) as RuleAction;
    const label = ACTION_LABELS[a.type] ?? a.type;
    if (a.type === "increase_budget" && a.budgetIncreasePercent !== undefined) {
      return `${label} (+${a.budgetIncreasePercent}%)`;
    }
    return label;
  } catch {
    return actionJson;
  }
}

interface RuleListProps {
  rules: AutomationRule[];
}

export function RuleList({ rules }: RuleListProps) {
  if (rules.length === 0) {
    return (
      <p className="text-sm text-gray-500 py-4 text-center">
        Nenhuma regra cadastrada ainda.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
            <th className="pb-3 pr-4">Nome</th>
            <th className="pb-3 pr-4">Condição</th>
            <th className="pb-3 pr-4">Ação</th>
            <th className="pb-3">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {rules.map((rule) => (
            <tr key={rule.id} className="hover:bg-gray-50/50 transition-colors">
              <td className="py-3 pr-4 font-medium text-gray-900">{rule.name}</td>
              <td className="py-3 pr-4 text-gray-600">{formatCondition(rule.conditionJson)}</td>
              <td className="py-3 pr-4 text-gray-600">{formatAction(rule.actionJson)}</td>
              <td className="py-3">
                {rule.isActive ? (
                  <Badge variant="success">Ativa</Badge>
                ) : (
                  <Badge variant="secondary">Inativa</Badge>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
