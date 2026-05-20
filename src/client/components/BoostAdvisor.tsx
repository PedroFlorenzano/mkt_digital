"use client";

import { useState } from "react";
import { Zap, Loader2, Check, X, Target, DollarSign, Calendar } from "lucide-react";
import { Button } from "@client/components/ui/button";
import { Card, CardContent } from "@client/components/ui/card";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BoostAdvisorProps {
  postId: string;
  postStatus: "published" | "scheduled" | "draft";
}

interface BoostSuggestion {
  objective: string;
  targetAudience: string;
  dailyBudgetBrl: number;
  durationDays: number;
  rationale: string;
}

type Phase =
  | { name: "idle" }
  | { name: "loading" }
  | { name: "suggestion"; suggestion: BoostSuggestion }
  | { name: "confirming"; suggestion: BoostSuggestion }
  | { name: "success" }
  | { name: "error"; message: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBrl(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BoostAdvisor({ postId, postStatus }: BoostAdvisorProps) {
  const [phase, setPhase] = useState<Phase>({ name: "idle" });

  const isDraft = postStatus === "draft";

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function handleAnalyze() {
    setPhase({ name: "loading" });

    try {
      const res = await fetch(`/api/posts/${postId}/boost`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "analyze" }),
      });

      const data = (await res.json()) as { suggestion?: BoostSuggestion; error?: string };

      if (!res.ok) {
        setPhase({ name: "error", message: data.error ?? "Erro ao analisar o post." });
        return;
      }

      if (!data.suggestion) {
        setPhase({ name: "error", message: "Resposta inválida do servidor." });
        return;
      }

      setPhase({ name: "suggestion", suggestion: data.suggestion });
    } catch {
      setPhase({ name: "error", message: "Erro de conexão. Tente novamente." });
    }
  }

  async function handleConfirm(suggestion: BoostSuggestion) {
    setPhase({ name: "confirming", suggestion });

    try {
      const res = await fetch(`/api/posts/${postId}/boost`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "confirm", suggestion }),
      });

      const data = (await res.json()) as { success?: boolean; error?: string };

      if (!res.ok) {
        setPhase({ name: "error", message: data.error ?? "Erro ao confirmar o boost." });
        return;
      }

      setPhase({ name: "success" });
    } catch {
      setPhase({ name: "error", message: "Erro de conexão. Tente novamente." });
    }
  }

  function handleCancel() {
    setPhase({ name: "idle" });
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* ── Trigger button ── */}
      {(phase.name === "idle" || phase.name === "error") && (
        <div
          title={isDraft ? "Publique o post primeiro" : undefined}
          className="inline-block"
        >
          <Button
            onClick={handleAnalyze}
            disabled={isDraft}
            variant="outline"
            className="gap-2"
            aria-label="Turbinar post"
          >
            <Zap className="h-4 w-4" />
            Turbinar post
          </Button>
        </div>
      )}

      {/* ── Loading (analyze) ── */}
      {phase.name === "loading" && (
        <div className="flex items-center gap-2 py-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
          <span>Analisando post…</span>
        </div>
      )}

      {/* ── Suggestion card ── */}
      {phase.name === "suggestion" && (
        <Card>
          <CardContent className="space-y-4 pt-4">
            <h3 className="text-base font-semibold text-gray-900">Sugestão de Boost</h3>

            <ul className="space-y-3" aria-label="Detalhes da sugestão de boost">
              {/* Objective */}
              <li className="flex items-start gap-2">
                <Target className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" aria-hidden="true" />
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Objetivo
                  </p>
                  <p className="text-sm text-gray-900">{phase.suggestion.objective}</p>
                </div>
              </li>

              {/* Target audience */}
              <li className="flex items-start gap-2">
                <Zap className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" aria-hidden="true" />
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Público-alvo
                  </p>
                  <p className="text-sm text-gray-900">{phase.suggestion.targetAudience}</p>
                </div>
              </li>

              {/* Daily budget */}
              <li className="flex items-start gap-2">
                <DollarSign className="mt-0.5 h-4 w-4 shrink-0 text-green-600" aria-hidden="true" />
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Orçamento diário
                  </p>
                  <p className="text-sm text-gray-900">
                    {formatBrl(phase.suggestion.dailyBudgetBrl)}
                  </p>
                </div>
              </li>

              {/* Duration */}
              <li className="flex items-start gap-2">
                <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-orange-600" aria-hidden="true" />
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Duração
                  </p>
                  <p className="text-sm text-gray-900">
                    {phase.suggestion.durationDays}{" "}
                    {phase.suggestion.durationDays === 1 ? "dia" : "dias"}
                  </p>
                </div>
              </li>
            </ul>

            {/* Actions */}
            <div className="flex flex-wrap gap-2 pt-2">
              <Button
                onClick={() => handleConfirm((phase as { name: "suggestion"; suggestion: BoostSuggestion }).suggestion)}
                variant="default"
                className="gap-2"
              >
                <Check className="h-4 w-4" />
                Confirmar e criar campanha
              </Button>
              <Button
                onClick={handleCancel}
                variant="outline"
                className="gap-2"
              >
                <X className="h-4 w-4" />
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Loading (confirm) ── */}
      {phase.name === "confirming" && (
        <div className="flex items-center gap-2 py-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
          <span>Criando campanha…</span>
        </div>
      )}

      {/* ── Success ── */}
      {phase.name === "success" && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Campanha de boost criada com sucesso!</span>
        </div>
      )}

      {/* ── Error ── */}
      {phase.name === "error" && (
        <p className="text-sm text-red-600" role="alert">
          {phase.message}
        </p>
      )}
    </div>
  );
}
