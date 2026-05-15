"use client";

import { useState } from "react";
import { Button } from "@client/components/ui/button";
import { Input } from "@client/components/ui/input";
import { Label } from "@client/components/ui/label";

interface RuleCreateFormProps {
  onSuccess: () => void;
}

const selectClass =
  "flex h-10 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:border-transparent disabled:cursor-not-allowed disabled:opacity-50";

export function RuleCreateForm({ onSuccess }: RuleCreateFormProps) {
  const [name, setName] = useState("");
  const [metric, setMetric] = useState<"cpc" | "ctr" | "roas" | "totalCost" | "conversions">("cpc");
  const [operator, setOperator] = useState<"gt" | "lt" | "eq">("gt");
  const [conditionValue, setConditionValue] = useState("");
  const [actionType, setActionType] = useState<
    "pause_ad" | "pause_adset" | "increase_budget" | "replace_creative"
  >("pause_ad");
  const [budgetIncreasePercent, setBudgetIncreasePercent] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const body: Record<string, unknown> = {
      name,
      condition: {
        metric,
        operator,
        value: Number(conditionValue),
      },
      action: {
        type: actionType,
        ...(actionType === "increase_budget" && budgetIncreasePercent !== ""
          ? { budgetIncreasePercent: Number(budgetIncreasePercent) }
          : {}),
      },
      ...(campaignId.trim() !== "" ? { campaignId: campaignId.trim() } : {}),
    };

    try {
      const res = await fetch("/api/paid-traffic/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Erro ao criar regra.");
      }

      // Reset form
      setName("");
      setMetric("cpc");
      setOperator("gt");
      setConditionValue("");
      setActionType("pause_ad");
      setBudgetIncreasePercent("");
      setCampaignId("");
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Name */}
      <div className="space-y-1.5">
        <Label htmlFor="rule-name">Nome da Regra</Label>
        <Input
          id="rule-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex: Pausar anúncio com CPC alto"
          required
        />
      </div>

      {/* Condition */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-gray-700">Condição</p>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="rule-metric">Métrica</Label>
            <select
              id="rule-metric"
              value={metric}
              onChange={(e) => setMetric(e.target.value as typeof metric)}
              className={selectClass}
            >
              <option value="cpc">CPC</option>
              <option value="ctr">CTR</option>
              <option value="roas">ROAS</option>
              <option value="totalCost">Custo Total</option>
              <option value="conversions">Conversões</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rule-operator">Operador</Label>
            <select
              id="rule-operator"
              value={operator}
              onChange={(e) => setOperator(e.target.value as typeof operator)}
              className={selectClass}
            >
              <option value="gt">Maior que</option>
              <option value="lt">Menor que</option>
              <option value="eq">Igual a</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rule-value">Valor</Label>
            <Input
              id="rule-value"
              type="number"
              step="any"
              value={conditionValue}
              onChange={(e) => setConditionValue(e.target.value)}
              placeholder="0"
              required
            />
          </div>
        </div>
      </div>

      {/* Action */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-gray-700">Ação</p>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="rule-action-type">Tipo de Ação</Label>
            <select
              id="rule-action-type"
              value={actionType}
              onChange={(e) => setActionType(e.target.value as typeof actionType)}
              className={selectClass}
            >
              <option value="pause_ad">Pausar Anúncio</option>
              <option value="pause_adset">Pausar Ad Set</option>
              <option value="increase_budget">Aumentar Orçamento</option>
              <option value="replace_creative">Substituir Criativo</option>
            </select>
          </div>

          {actionType === "increase_budget" && (
            <div className="space-y-1.5">
              <Label htmlFor="rule-budget-percent">Percentual de Aumento (%)</Label>
              <Input
                id="rule-budget-percent"
                type="number"
                step="any"
                min="0"
                value={budgetIncreasePercent}
                onChange={(e) => setBudgetIncreasePercent(e.target.value)}
                placeholder="Ex: 20"
              />
            </div>
          )}
        </div>
      </div>

      {/* Optional campaign ID */}
      <div className="space-y-1.5">
        <Label htmlFor="rule-campaign-id">ID da Campanha (opcional)</Label>
        <Input
          id="rule-campaign-id"
          value={campaignId}
          onChange={(e) => setCampaignId(e.target.value)}
          placeholder="Deixe em branco para aplicar a todas"
        />
      </div>

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      <Button type="submit" disabled={loading} className="w-full sm:w-auto">
        {loading ? "Criando…" : "Criar Regra"}
      </Button>
    </form>
  );
}
