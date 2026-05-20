"use client";

import { useState } from "react";
import { TrendingUp, TrendingDown, Minus, AlertCircle, Sparkles, Loader2 } from "lucide-react";
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
  // Start in "idle" — user must click to trigger the Bedrock call
  const [phase, setPhase] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [recommendations, setRecommendations] = useState<BudgetRecommendation[]>([]);
  const [aiSummary, setAiSummary] = useState("");
  const [totalCurrent, setTotalCurrent] = useState(0);
  const [totalRecommended, setTotalRecommended] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [applySuccess, setApplySuccess] = useState(false);
  const [confirmModal, setConfirmModal] = useState<ConfirmModalAllocation[] | null>(null);

  // ── Fetch recommendations from API ──────────────────────────────────────

  async function loadRecommendations() {
    setPhase("loading");
    setError(null);
    setApplySuccess(false);

    try {
      const res = await fetch("/api/paid-traffic/budget-intelligence");
      const data = (await res.json()) as BudgetApiResponse & { error?: string };

      if (!res.ok) {
        throw new Error(data.error ?? "Falha ao carregar recomendações");
      }

      setRecommendations(mapApiToRecommendations(data));
      setAiSummary(data.aiSummary ?? "");
      setTotalCurrent(data.totalCurrentBrl ?? 0);
      setTotalRecommended(data.totalRecommendedBrl ?? 0);
      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
      setPhase("error");
    }
  }

  // ── Apply allocations ───────────────────────────────────────────────────

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
      (r) => r.recommendedDailyBudgetBrl > 500,
    );

    if (highBudget.length > 0) {
      setConfirmModal(
        highBudget.map((r) => ({
          campaignId: r.campaignId,
          campaignName: r.campaignName,
          currentBudget: r.currentDailyBudgetBrl,
          newBudget: r.recommendedDailyBudgetBrl,
        })),
      );
    } else {
      void applyAllocations(allAllocations);
    }
  }

  function handleModalConfirm(selectedAllocations: ApplyAllocation[]) {
    const confirmedIds = new Set(selectedAllocations.map((a) => a.campaignId));
    const lowBudget: ApplyAllocation[] = recommendations
      .filter((r) => r.recommendedDailyBudgetBrl <= 500)
      .map((r) => ({
        campaignId: r.campaignId,
        newDailyBudgetBrl: r.recommendedDailyBudgetBrl,
      }));

    const allToApply = [
      ...selectedAllocations,
      ...lowBudget.filter((a) => !confirmedIds.has(a.campaignId)),
    ];

    void applyAllocations(allToApply);
  }

  // ── Render: idle (never loaded yet) ─────────────────────────────────────

  if (phase === "idle") {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-20 gap-5">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-green-100 to-blue-100">
            <TrendingUp className="h-8 w-8 text-green-600" />
          </div>
          <div className="text-center">
            <p className="font-semibold text-gray-800 mb-1">Análise de orçamento sob demanda</p>
            <p className="text-sm text-gray-500 max-w-sm">
              A IA analisa as métricas dos últimos 30 dias de todas as campanhas ativas
              e gera recomendações de redistribuição de verba.
            </p>
          </div>
          <Button onClick={() => void loadRecommendations()} className="gap-2">
            <Sparkles className="h-4 w-4" />
            Gerar recomendações
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ── Render: loading ──────────────────────────────────────────────────────

  if (phase === "loading") {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
          <p className="text-sm text-gray-500">
            Analisando campanhas e gerando recomendações…
          </p>
          <p className="text-xs text-gray-400">Isso pode levar alguns segundos.</p>
        </CardContent>
      </Card>
    );
  }

  // ── Render: error ────────────────────────────────────────────────────────

  if (phase === "error") {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
          <AlertCircle className="h-10 w-10 text-red-400" />
          <p className="text-gray-700 font-medium text-sm">{error}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadRecommendations()}
          >
            Tentar novamente
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ── Render: done — no recommendations ───────────────────────────────────

  if (recommendations.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
          <TrendingUp className="h-10 w-10 text-gray-300" />
          <p className="text-gray-500 text-sm">
            Nenhuma recomendação disponível no momento.
          </p>
          <p className="text-xs text-gray-400">
            É necessário ter campanhas ativas com pelo menos 7 dias de métricas.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadRecommendations()}
          >
            Atualizar
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ── Render: done — with recommendations ─────────────────────────────────

  const budgetDiff = totalRecommended - totalCurrent;

  return (
    <>
      {/* AI Summary card */}
      {aiSummary && (
        <Card className="border-blue-100 bg-blue-50/50">
          <CardContent className="py-4 px-5">
            <p className="text-sm text-blue-800 leading-relaxed whitespace-pre-line">
              {aiSummary}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Totals summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="py-4 px-5">
            <p className="text-xs text-gray-400 uppercase font-medium mb-1">
              Orçamento atual / dia
            </p>
            <p className="text-xl font-semibold text-gray-900">{fmtBrl(totalCurrent)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 px-5">
            <p className="text-xs text-gray-400 uppercase font-medium mb-1">
              Orçamento recomendado / dia
            </p>
            <p className="text-xl font-semibold text-gray-900">{fmtBrl(totalRecommended)}</p>
          </CardContent>
        </Card>
        <Card className={budgetDiff >= 0 ? "border-green-200 bg-green-50/40" : "border-red-100 bg-red-50/30"}>
          <CardContent className="py-4 px-5">
            <p className="text-xs text-gray-400 uppercase font-medium mb-1">
              Variação total / dia
            </p>
            <p className={`text-xl font-semibold ${budgetDiff >= 0 ? "text-green-700" : "text-red-600"}`}>
              {budgetDiff >= 0 ? "+" : ""}{fmtBrl(budgetDiff)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recommendations table */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <CardTitle className="text-base">Recomendações por campanha</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void loadRecommendations()}
              className="text-xs text-gray-500 h-7"
            >
              Atualizar
            </Button>
          </div>
          {applySuccess ? (
            <Badge variant="success">Aplicado com sucesso</Badge>
          ) : (
            <Button
              size="sm"
              onClick={handleApplyClick}
              disabled={applying}
              className="gap-2"
            >
              {applying ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Aplicando…
                </>
              ) : (
                "Aplicar todas as recomendações"
              )}
            </Button>
          )}
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-gray-100">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">
                    Campanha
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wide">
                    Plataforma
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wide">
                    Atual / dia
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wide">
                    Recomendado / dia
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wide">
                    Variação
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-400 uppercase tracking-wide">
                    Confiança
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {recommendations.map((rec) => (
                  <tr
                    key={rec.campaignId}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-4 py-3 max-w-[260px]">
                      <div className="font-medium text-gray-800 truncate">
                        {rec.campaignName}
                      </div>
                      <BudgetAiJustification
                        campaignName={rec.campaignName}
                        justification={rec.aiJustification}
                        dataConfidence={rec.dataConfidence}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant="secondary"
                        className="capitalize text-xs"
                      >
                        {rec.platform}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-500 whitespace-nowrap">
                      {fmtBrl(rec.currentDailyBudgetBrl)}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900 whitespace-nowrap">
                      {fmtBrl(rec.recommendedDailyBudgetBrl)}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <VariationBadge percent={rec.variationPercent} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      {rec.dataConfidence === "sufficient" ? (
                        <Badge variant="success" className="text-xs">
                          Alta
                        </Badge>
                      ) : (
                        <Badge variant="warning" className="text-xs">
                          Baixa
                        </Badge>
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
