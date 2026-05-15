"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@client/components/ui/button";
import { Label } from "@client/components/ui/label";
import { Card, CardContent } from "@client/components/ui/card";
import { Separator } from "@client/components/ui/separator";
import { Badge } from "@client/components/ui/badge";
import {
  ChevronLeft,
  Rocket,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
} from "lucide-react";
import type { CampaignDraft } from "@server/services/campaign.service";
import type { AdCampaign } from "@prisma/client";

interface StepSelectPlatformProps {
  draft: CampaignDraft;
  onBack: () => void;
}

type Platform = "meta" | "google";

const PLATFORM_LABELS: Record<Platform, string> = {
  meta: "Meta Ads",
  google: "Google Ads",
};

export function StepSelectPlatform({ draft, onBack }: StepSelectPlatformProps) {
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<Platform>>(
    new Set<Platform>(["meta"])
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [launchedCampaigns, setLaunchedCampaigns] = useState<AdCampaign[] | null>(null);

  function togglePlatform(platform: Platform) {
    setSelectedPlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(platform)) {
        next.delete(platform);
      } else {
        next.add(platform);
      }
      return next;
    });
  }

  async function handleLaunch() {
    if (selectedPlatforms.size === 0) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/paid-traffic/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draft,
          platforms: Array.from(selectedPlatforms),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(
          (data as { error?: string }).error ??
            "Ocorreu um erro ao lançar a campanha. Verifique suas credenciais e tente novamente."
        );
        return;
      }

      const campaigns = (await res.json()) as AdCampaign[];
      setLaunchedCampaigns(campaigns);
    } catch {
      setError("Erro de conexão. Verifique sua internet e tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  if (launchedCampaigns) {
    return (
      <div className="space-y-6">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="h-6 w-6 text-green-500 shrink-0 mt-0.5" />
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Campanha lançada com sucesso!
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Sua campanha foi criada nas plataformas selecionadas.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {launchedCampaigns.map((campaign) => (
            <Card key={campaign.id}>
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <Badge variant="success">
                    {PLATFORM_LABELS[campaign.platform as Platform] ?? campaign.platform}
                  </Badge>
                  <span className="text-sm text-gray-700 line-clamp-1">{campaign.name}</span>
                </div>
                {campaign.managerUrl && (
                  <Button variant="outline" size="sm" asChild>
                    <a
                      href={campaign.managerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Gerenciador {PLATFORM_LABELS[campaign.platform as Platform] ?? campaign.platform}
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        <Separator />

        <div className="flex justify-start">
          <Button variant="default" asChild>
            <Link href="/paid-traffic">Ver Campanhas</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-1">
          Passo 3 — Selecione as plataformas
        </h2>
        <p className="text-sm text-gray-500">
          Escolha em quais plataformas você deseja lançar a campanha.
        </p>
      </div>

      <div className="space-y-3">
        {(["meta", "google"] as Platform[]).map((platform) => (
          <label
            key={platform}
            className={`flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all ${
              selectedPlatforms.has(platform)
                ? "border-blue-500 bg-blue-50"
                : "border-gray-200 bg-white hover:border-gray-300"
            }`}
          >
            <input
              type="checkbox"
              checked={selectedPlatforms.has(platform)}
              onChange={() => togglePlatform(platform)}
              className="h-4 w-4 accent-blue-600"
              aria-label={PLATFORM_LABELS[platform]}
            />
            <div className="flex-1">
              <Label className="cursor-pointer font-semibold text-gray-800">
                {PLATFORM_LABELS[platform]}
              </Label>
              <p className="text-xs text-gray-500 mt-0.5">
                {platform === "meta"
                  ? "Facebook e Instagram Ads"
                  : "Search, Display e YouTube"}
              </p>
            </div>
            {selectedPlatforms.has(platform) && (
              <CheckCircle2 className="h-5 w-5 text-blue-500 shrink-0" />
            )}
          </label>
        ))}
      </div>

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="flex items-start gap-3 pt-4 pb-4">
            <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </CardContent>
        </Card>
      )}

      <Separator />

      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={onBack} disabled={loading}>
          <ChevronLeft className="h-4 w-4" />
          Voltar
        </Button>
        <Button
          variant="gradient"
          onClick={handleLaunch}
          disabled={loading || selectedPlatforms.size === 0}
        >
          {loading ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" />
              Lançando...
            </>
          ) : (
            <>
              <Rocket className="h-4 w-4" />
              Lançar Campanha
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
