"use client";

import { useState } from "react";
import { Button } from "@client/components/ui/button";
import { Input } from "@client/components/ui/input";
import { Label } from "@client/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@client/components/ui/card";
import { Separator } from "@client/components/ui/separator";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { CampaignDraft } from "@server/services/campaign.service";

interface StepReviewAiDraftProps {
  draft: CampaignDraft;
  onContinue: (draft: CampaignDraft) => void;
  onBack: () => void;
}

export function StepReviewAiDraft({ draft, onContinue, onBack }: StepReviewAiDraftProps) {
  const [objective, setObjective] = useState(draft.objective);
  const [ageMin, setAgeMin] = useState(draft.audience.ageMin);
  const [ageMax, setAgeMax] = useState(draft.audience.ageMax);
  const [locations, setLocations] = useState(draft.audience.locations.join(", "));
  const [dailyBudgetBrl, setDailyBudgetBrl] = useState(draft.dailyBudgetBrl);
  const [adCopyVariations, setAdCopyVariations] = useState(
    (draft.adCopies[0]?.variations ?? []).join("\n")
  );
  const [creativeBrief, setCreativeBrief] = useState(draft.creativeBrief);

  function handleContinue() {
    const updatedDraft: CampaignDraft = {
      ...draft,
      objective,
      audience: {
        ...draft.audience,
        ageMin,
        ageMax,
        locations: locations
          .split(",")
          .map((l) => l.trim())
          .filter(Boolean),
      },
      dailyBudgetBrl,
      adCopies: draft.adCopies.map((copy, idx) => {
        if (idx === 0) {
          return {
            ...copy,
            variations: adCopyVariations
              .split("\n")
              .map((v) => v.trim())
              .filter(Boolean),
          };
        }
        return copy;
      }),
      creativeBrief,
    };
    onContinue(updatedDraft);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-1">
          Passo 2 — Revise o rascunho da IA
        </h2>
        <p className="text-sm text-gray-500">
          Confira e ajuste os campos gerados pela IA antes de selecionar as plataformas.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Objetivo da campanha</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="objective">Objetivo</Label>
            <Input
              id="objective"
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              placeholder="Descreva o objetivo principal da campanha"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Segmentação de audiência</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="age-min">Idade mínima</Label>
              <Input
                id="age-min"
                type="number"
                min={13}
                max={ageMax}
                value={ageMin}
                onChange={(e) => setAgeMin(Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="age-max">Idade máxima</Label>
              <Input
                id="age-max"
                type="number"
                min={ageMin}
                max={65}
                value={ageMax}
                onChange={(e) => setAgeMax(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="locations">Localizações (separadas por vírgula)</Label>
            <textarea
              id="locations"
              value={locations}
              onChange={(e) => setLocations(e.target.value)}
              rows={2}
              placeholder="Ex: São Paulo, Rio de Janeiro, Belo Horizonte"
              className="flex w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:border-transparent disabled:cursor-not-allowed disabled:opacity-50 resize-none"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Orçamento</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="daily-budget">Orçamento diário</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-gray-500">
                R$
              </span>
              <Input
                id="daily-budget"
                type="number"
                min={1}
                step={0.01}
                value={dailyBudgetBrl}
                onChange={(e) => setDailyBudgetBrl(Number(e.target.value))}
                className="pl-9"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Copies do anúncio
            {draft.adCopies[0]?.placement && (
              <span className="ml-2 text-xs font-normal text-gray-500">
                ({draft.adCopies[0].placement})
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ad-copy-variations">Variações (uma por linha)</Label>
            <textarea
              id="ad-copy-variations"
              value={adCopyVariations}
              onChange={(e) => setAdCopyVariations(e.target.value)}
              rows={5}
              placeholder="Variação 1&#10;Variação 2&#10;Variação 3"
              className="flex w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:border-transparent disabled:cursor-not-allowed disabled:opacity-50 resize-none"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Brief criativo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="creative-brief">Instruções para o designer</Label>
            <textarea
              id="creative-brief"
              value={creativeBrief}
              onChange={(e) => setCreativeBrief(e.target.value)}
              rows={4}
              placeholder="Descreva as diretrizes visuais para os criativos..."
              className="flex w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:border-transparent disabled:cursor-not-allowed disabled:opacity-50 resize-none"
            />
          </div>
        </CardContent>
      </Card>

      <Separator />

      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={onBack}>
          <ChevronLeft className="h-4 w-4" />
          Voltar
        </Button>
        <Button variant="gradient" onClick={handleContinue}>
          Continuar
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
