"use client";

import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, Minus, AlertCircle } from "lucide-react";
import { Button } from "@client/components/ui/button";
import { Badge } from "@client/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@client/components/ui/card";
import { BudgetAiJustification } from "@client/components/paid-traffic/budget/BudgetAiJustification";
import { BudgetConfirmModal } from "@client/components/paid-traffic/budget/BudgetConfirmModal";

interface BudgetRecommendation {
  campaignId: string;
  campaignName: string;
  platform: string;
  currentDailyBudgetBrl: number;
  recommendedDailyBudgetBrl: number;
  variationPercent: number;
  dataConfidence: "sufficient" | "insufficient";
  aiJustification: string;
}

interface ApplyAllocation {
  campaignId: string;
  newDailyBudgetBrl: number;
}

interface ConfirmModalAllocation {
  campaignId: string;
  campaignName: string;
  currentBudget: number;
  newBudget: number;
}

// Shape returned by the API (/api/paid-traffic/budget-intelligence)
interface BudgetApiResponse {
  allocations: Array<{
    campaignId: string;
    campaignName: string;
    platform: string;
    currentDailyBudgetBrl: number;
    recommendedDailyBudgetBrl: number;
    changePercent: number;
    dataConfidence: "sufficient" | "insufficient";
    justification: string;
  }>;
  aiSummary: string;
  totalCurrentBrl: number;
  totalRecommendedBrl: number;
  generatedAt: string;
}

function mapApiToRecommendations(data: BudgetApiResponse): BudgetRecommendation[] {
  return (data.allocations ?? []).map((a) => ({
    campaignId: a.campaignId,
    campaignName: a.campaignName,
    platform: a.platform,
    currentDailyBudgetBrl: a.currentDailyBudgetBrl,
    recommendedDailyBudgetBrl: a.recommendedDailyBudgetBrl,
    variationPercent: a.changePercent,
    dataConfidence: a.dataConfidence,
    aiJustification: a.justification,
  }));
}

function fmtBrl(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function VariationBadge({ percent }: { percent: number }) {
  if (percent > 0) {
    return (
      <span className="inline-flex items-center gap-1 text-green-600 font-medium text-sm">
        <TrendingUp className="h-3.5 w-3.5" />
        +{percent.toFixed(1)}%
      </span>
    );
  }
  if (percent < 0) {
    return (
      <span className="inline-flex items-center gap-1 text-red-500 font-medium text-sm">
        <TrendingDown className="h-3.5 w-3.5" />
        {percent.toFixed(1)}%
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-gray-400 font-medium text-sm">
      <Minus className="h-3.5 w-3.5" />
      0%
    </span>
  );
}

export function BudgetComparisonTable() {
  const [recommendations, setRecommendations] = useState<BudgetRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [applySuccess, setApplySuccess] = useState(false);
  const [confirmModal, setConfirmModal] = useState<ConfirmModalAllocation[] | null>(null);

  useEffect(() => {
    fetch("/api/paid-traffic/budget-intelligence")
      .then((res) => {
        if (!res.ok) throw new Error("Falha ao carregar recomendações");
        return res.json() as Promise<BudgetApiResponse>;
      })
      .then((data) => {
        setRecommendations(mapApiToRecommendations(data));
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Erro desconhecido");
        setLoading(false);
      });
  }, []);

  async function applyAllocations(allocations: ApplyAllocation[]) {
    setApplying(true);
    try {
      const res = await fetch("/api/paid-traffic/budget-intelligence/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allocations }),
      });
      if (!res.ok) throw new Error("Falha ao aplicar recomendações");
      setApplySuccess(true);
    } catch {
      setError("Falha ao aplicar recomendações. Tente novamente.");
    } finally {
      setApplying(false);
      setConfirmModal(null);
    }
  }

  function handleApplyClick() {
    const allAllocations: ApplyAllocation[] = recommendations.map((r) => ({
      campaignId: r.campaignId,
      newDailyBudgetBrl: r.recommendedDailyBudgetBrl,
    }));

    const highBudget = recommendations.filter(
      (r) => r.recommendedDailyBudgetBrl > 500
    );

    if (highBudget.length > 0) {
      setConfirmModal(
        highBudget.map((r) => ({
          campaignId: r.campaignId,
          campaignName: r.campaignName,
          currentBudget: r.currentDailyBudgetBrl,
          newBudget: r.recommendedDailyBudgetBrl,
        }))
      );
    } else {
      applyAllocations(allAllocations);
    }
  }

  function handleModalConfirm(selectedAllocations: ApplyAllocation[]) {
    // Merge: confirmed high-budget allocations + direct low-budget ones
    const confirmedIds = new Set(selectedAllocations.map((a) => a.campaignId));
    const lowBudget: ApplyAllocation[] = recommendations
      .filter((r) => r.recommendedDailyBudgetBrl <= 500)
      .map((r) => ({ campaignId: r.campaignId, newDailyBudgetBrl: r.recommendedDailyBudgetBrl }));

    const allToApply = [
      ...selectedAllocations,
      ...lowBudget.filter((a) => !confirmedIds.has(a.campaignId)),
    ];

    applyAllocations(allToApply);
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
          <AlertCircle className="h-10 w-10 text-red-400" />
          <p className="text-gray-500 text-sm">{error}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setError(null);
              setLoading(true);
              fetch("/api/paid-traffic/budget-intelligence")
                .then((r) => r.json() as Promise<BudgetApiResponse>)
                .then((data) => {
                  setRecommendations(mapApiToRecommendations(data));
                  setLoading(false);
                })
                .catch(() => {
                  setError("Falha ao carregar recomendações");
                  setLoading(false);
                });
            }}
          >
            Tentar novamente
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (recommendations.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
          <TrendingUp className="h-10 w-10 text-gray-300" />
          <p className="text-gray-500 text-sm">Nenhuma recomendação disponível no momento.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base">Recomendações de orçamento</CardTitle>
          {applySuccess ? (
            <Badge variant="success">Aplicado com sucesso</Badge>
          ) : (
            <Button
              size="sm"
              onClick={handleApplyClick}
              disabled={applying}
            >
              {applying ? (
                <>
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Aplicando...
                </>
              ) : (
                "Aplicar Recomendações"
              )}
            </Button>
          )}
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-gray-100">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                    Campanha
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">
                    Plataforma
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">
                    Orçamento Atual
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">
                    Orçamento Recomendado
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase">
                    Variação %
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-400 uppercase">
                    Confiança
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {recommendations.map((rec) => (
                  <tr key={rec.campaignId} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-800">{rec.campaignName}</div>
                      <BudgetAiJustification
                        campaignName={rec.campaignName}
                        justification={rec.aiJustification}
                        dataConfidence={rec.dataConfidence}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="secondary" className="capitalize text-xs">
                        {rec.platform}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500">
                      {fmtBrl(rec.currentDailyBudgetBrl)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">
                      {fmtBrl(rec.recommendedDailyBudgetBrl)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <VariationBadge percent={rec.variationPercent} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      {rec.dataConfidence === "sufficient" ? (
                        <Badge variant="success" className="text-xs">Alta</Badge>
                      ) : (
                        <Badge variant="warning" className="text-xs">Baixa</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {confirmModal && (
        <BudgetConfirmModal
          allocations={confirmModal}
          onConfirm={handleModalConfirm}
          onCancel={() => setConfirmModal(null)}
          isLoading={applying}
        />
      )}
    </>
  );
}
