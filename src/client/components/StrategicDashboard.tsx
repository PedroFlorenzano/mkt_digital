"use client";

import { useState } from "react";
import {
  TrendingUp,
  AlertTriangle,
  Sparkles,
  CheckCircle2,
  Loader2,
  DollarSign,
  PauseCircle,
  Users,
  FileEdit,
  Target,
} from "lucide-react";
import { Button } from "@client/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@client/components/ui/card";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RouteChange {
  id: string;
  title: string;
  description: string;
  expectedImpact: string;
  type: "budget_adjustment" | "pause_campaign" | "new_audience" | "editorial";
  campaignId?: string;
  campaignName?: string;
  suggestedBudgetBrl?: number;
}

interface StrategicDiagnosis {
  strengths: string[];
  alerts: string[];
  routeChanges: RouteChange[];
  generatedAt: string; // ISO
  aiSummary: string;
}

// Route_Change types that require an inline confirmation before applying
const CONFIRMATION_REQUIRED_TYPES: RouteChange["type"][] = [
  "budget_adjustment",
  "pause_campaign",
];

const TYPE_CONFIG: Record<
  RouteChange["type"],
  { label: string; icon: React.ElementType; badgeClass: string }
> = {
  budget_adjustment: {
    label: "Ajuste de orçamento",
    icon: DollarSign,
    badgeClass: "bg-green-100 text-green-700 border border-green-200",
  },
  pause_campaign: {
    label: "Pausar campanha",
    icon: PauseCircle,
    badgeClass: "bg-red-100 text-red-700 border border-red-200",
  },
  new_audience: {
    label: "Novo público",
    icon: Users,
    badgeClass: "bg-purple-100 text-purple-700 border border-purple-200",
  },
  editorial: {
    label: "Recomendação editorial",
    icon: FileEdit,
    badgeClass: "bg-gray-100 text-gray-600 border border-gray-200",
  },
};

// ---------------------------------------------------------------------------
// RouteChangeCard — sub-component
// ---------------------------------------------------------------------------

interface RouteChangeCardProps {
  routeChange: RouteChange;
  onApply: (routeChange: RouteChange) => Promise<void>;
}

function RouteChangeCard({ routeChange, onApply }: RouteChangeCardProps) {
  const [confirming, setConfirming] = useState(false);
  const [applying, setApplying] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const requiresConfirmation = CONFIRMATION_REQUIRED_TYPES.includes(routeChange.type);

  const handleApplyClick = () => {
    if (requiresConfirmation) {
      setConfirming(true);
    } else {
      void doApply();
    }
  };

  const doApply = async () => {
    setConfirming(false);
    setApplying(true);
    setFeedback(null);
    try {
      await onApply(routeChange);
      setFeedback({ type: "success", message: "Mudança aplicada com sucesso!" });
    } catch (err) {
      setFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "Erro ao aplicar mudança.",
      });
    } finally {
      setApplying(false);
    }
  };

  const applied = feedback?.type === "success";
  const typeConfig = TYPE_CONFIG[routeChange.type];
  const TypeIcon = typeConfig.icon;

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2">
        {/* Type badge + campaign name */}
        <div className="flex flex-wrap items-center gap-1.5 mb-2">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${typeConfig.badgeClass}`}
          >
            <TypeIcon className="h-3 w-3" />
            {typeConfig.label}
          </span>
        </div>

        <CardTitle className="text-sm leading-snug">{routeChange.title}</CardTitle>

        {/* Campaign pill — always shown when a campaignId is linked */}
        {routeChange.campaignId && (
          <div className="mt-1.5 flex items-center gap-1.5">
            <Target className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            <span className="text-xs text-gray-500">
              Campanha:{" "}
              <span className="font-semibold text-gray-700">
                {routeChange.campaignName ?? routeChange.campaignId}
              </span>
            </span>
          </div>
        )}

        {/* Budget change indicator */}
        {routeChange.type === "budget_adjustment" &&
          routeChange.suggestedBudgetBrl !== undefined && (
            <div className="mt-1 text-xs text-green-700 font-medium">
              Novo orçamento sugerido:{" "}
              {routeChange.suggestedBudgetBrl.toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
              })}
              /dia
            </div>
          )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3 flex-1">
        <p className="text-sm text-gray-600">{routeChange.description}</p>

        <p className="text-xs font-medium text-blue-700 bg-blue-50 rounded-md px-3 py-2">
          Impacto esperado: {routeChange.expectedImpact}
        </p>

        {/* Feedback banner */}
        {feedback && (
          <div
            className={`flex items-center gap-2 text-sm rounded-md px-3 py-2 ${
              feedback.type === "success"
                ? "bg-green-50 text-green-700"
                : "bg-red-50 text-red-700"
            }`}
          >
            {feedback.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0" />
            )}
            {feedback.message}
          </div>
        )}

        {/* Action buttons */}
        <div className="mt-auto pt-1">
          {confirming ? (
            <div className="space-y-2">
              <p className="text-xs text-gray-600 font-medium">
                Confirmar aplicação
                {routeChange.campaignName ? (
                  <> em <span className="text-gray-900">&quot;{routeChange.campaignName}&quot;</span>?</>
                ) : "?"}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => void doApply()}
                >
                  Confirmar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setConfirming(false)}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <Button
              size="sm"
              onClick={handleApplyClick}
              disabled={applying || applied}
            >
              {applying ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Aplicando...
                </>
              ) : applied ? (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Aplicado
                </>
              ) : (
                "Aplicar mudança"
              )}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// StrategicDashboard — main component
// ---------------------------------------------------------------------------

export function StrategicDashboard() {
  const [loading, setLoading] = useState(false);
  const [diagnosis, setDiagnosis] = useState<StrategicDiagnosis | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ── Generate diagnosis ───────────────────────────────────────────────────
  const handleGenerateDiagnosis = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/paid-traffic/strategy");
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Erro ${res.status}`);
      }
      const data = (await res.json()) as StrategicDiagnosis;
      setDiagnosis(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Erro ao gerar diagnóstico.",
      );
    } finally {
      setLoading(false);
    }
  };

  // ── Apply route change ───────────────────────────────────────────────────
  const handleApplyRouteChange = async (routeChange: RouteChange) => {
    const res = await fetch("/api/paid-traffic/strategy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ routeChange }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? `Erro ${res.status}`);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="h-5 w-5 text-indigo-600" />
            <h2 className="text-lg font-semibold text-gray-900">Análise Estratégica</h2>
          </div>
          <p className="text-sm text-gray-500 max-w-2xl">
            Diagnóstico completo do seu portfólio de campanhas. A IA analisa métricas dos últimos 30 dias,
            identifica o que está funcionando, levanta alertas de performance e sugere exatamente 3 mudanças
            de rota priorizadas por impacto. Quando uma mudança de rota envolve ajuste de orçamento, ela é
            executada via <strong className="text-gray-700">Inteligência de Orçamento</strong> — incluindo o
            envio direto para Meta Ads e Google Ads.
          </p>
          {diagnosis && (
            <p className="text-xs text-gray-400 mt-1">
              Gerado em {new Date(diagnosis.generatedAt).toLocaleString("pt-BR")}
            </p>
          )}
        </div>

        <Button
          onClick={() => void handleGenerateDiagnosis()}
          disabled={loading}
          className="shrink-0"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Gerando...
            </>
          ) : (
            "Gerar diagnóstico"
          )}
        </Button>
      </div>

      {/* Error banner */}
      {error && (
        <Card className="border-red-100">
          <CardContent className="flex items-center gap-3 py-4">
            <AlertTriangle className="h-5 w-5 text-red-400 shrink-0" />
            <p className="text-sm text-red-600">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Loading placeholder */}
      {loading && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
            <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
            <p className="text-sm text-gray-500">
              Analisando campanhas com IA… isso pode levar alguns segundos.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Diagnosis result */}
      {!loading && diagnosis && (
        <div className="space-y-6">
          {/* AI summary */}
          {diagnosis.aiSummary && (
            <Card className="border-blue-100 bg-blue-50">
              <CardContent className="py-4">
                <p className="text-sm text-blue-800 whitespace-pre-line leading-relaxed">
                  {diagnosis.aiSummary}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Strengths + Alerts */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Pontos Fortes */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2 text-green-700">
                  <TrendingUp className="h-5 w-5" />
                  Pontos Fortes
                </CardTitle>
              </CardHeader>
              <CardContent>
                {diagnosis.strengths.length === 0 ? (
                  <p className="text-sm text-gray-400 italic">
                    Nenhum ponto forte identificado.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {diagnosis.strengths.map((s, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-2 text-sm text-gray-700"
                      >
                        <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                        {s}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {/* Alertas */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2 text-orange-700">
                  <AlertTriangle className="h-5 w-5" />
                  Alertas
                </CardTitle>
              </CardHeader>
              <CardContent>
                {diagnosis.alerts.length === 0 ? (
                  <p className="text-sm text-gray-400 italic">
                    Nenhum alerta identificado.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {diagnosis.alerts.map((a, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-2 text-sm text-gray-700"
                      >
                        <AlertTriangle className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />
                        {a}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Route Changes */}
          <div>
            <h3 className="text-base font-semibold text-gray-900 mb-3">
              Mudanças de Rota Sugeridas
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {diagnosis.routeChanges.map((rc) => (
                <RouteChangeCard
                  key={rc.id}
                  routeChange={rc}
                  onApply={handleApplyRouteChange}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
