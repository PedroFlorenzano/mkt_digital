"use client";

import { useState } from "react";
import { Button } from "@client/components/ui/button";
import { Label } from "@client/components/ui/label";
import { Card, CardContent } from "@client/components/ui/card";
import { Sparkles, RefreshCw, AlertTriangle } from "lucide-react";
import type { CampaignDraft } from "@server/services/campaign.service";

interface StepDescribeGoalProps {
  onDraftGenerated: (draft: CampaignDraft) => void;
}

export function StepDescribeGoal({ onDraftGenerated }: StepDescribeGoalProps) {
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isUnavailable, setIsUnavailable] = useState(false);

  async function handleGenerate() {
    if (!description.trim()) return;
    setLoading(true);
    setError(null);
    setIsUnavailable(false);

    try {
      const res = await fetch("/api/paid-traffic/campaigns/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      });

      if (res.status === 502) {
        setIsUnavailable(true);
        return;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(
          (data as { error?: string }).error ??
            "Ocorreu um erro ao gerar a campanha. Tente novamente."
        );
        return;
      }

      const draft = (await res.json()) as CampaignDraft;
      onDraftGenerated(draft);
    } catch {
      setError("Erro de conexão. Verifique sua internet e tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  function handleRetry() {
    setIsUnavailable(false);
    setError(null);
    handleGenerate();
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-1">
          Passo 1 — Descreva o objetivo da campanha
        </h2>
        <p className="text-sm text-gray-500">
          Conte o que você quer alcançar e nossa IA irá gerar um rascunho completo da campanha.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="campaign-description">Objetivo da campanha</Label>
        <textarea
          id="campaign-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={5}
          placeholder="Ex: Quero aumentar as vendas do meu e-commerce de roupas femininas com foco em mulheres de 25 a 40 anos em São Paulo..."
          className="flex w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:border-transparent disabled:cursor-not-allowed disabled:opacity-50 resize-none"
          disabled={loading}
        />
      </div>

      {isUnavailable && (
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="flex items-start gap-3 pt-4 pb-4">
            <AlertTriangle className="h-5 w-5 text-orange-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-orange-800">
                Serviço de IA temporariamente indisponível. Tente novamente em alguns instantes.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 border-orange-300 text-orange-700 hover:bg-orange-100"
                onClick={handleRetry}
                disabled={loading}
              >
                <RefreshCw className="h-4 w-4" />
                Tentar novamente
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {error && !isUnavailable && (
        <p className="text-sm text-red-600 flex items-center gap-1">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </p>
      )}

      <Button
        variant="gradient"
        onClick={handleGenerate}
        disabled={loading || !description.trim()}
        className="w-full sm:w-auto"
      >
        {loading ? (
          <>
            <RefreshCw className="h-4 w-4 animate-spin" />
            Gerando campanha...
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4" />
            Gerar com IA
          </>
        )}
      </Button>
    </div>
  );
}
