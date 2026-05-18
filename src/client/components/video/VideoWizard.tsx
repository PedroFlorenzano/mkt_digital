"use client";

import { useState } from "react";
import { UploadDropzone } from "@client/components/video/UploadDropzone";
import { Button } from "@client/components/ui/button";
import { Input } from "@client/components/ui/input";
import { Label } from "@client/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@client/components/ui/card";
import { Separator } from "@client/components/ui/separator";
import { Badge } from "@client/components/ui/badge";
import {
  ChevronRight,
  ChevronLeft,
  Rocket,
  RefreshCw,
  CheckCircle2,
  Video,
  Camera,
  Lightbulb,
  Scissors,
} from "lucide-react";
import { useRouter } from "next/navigation";

type Platform = "instagram_reels" | "tiktok" | "youtube_shorts";
type Duration = 15 | 30 | 60;
type Style = "realistic" | "cinematic" | "minimalist";
type Voice = "Camila" | "Ricardo";

const PLATFORMS: Array<{ value: Platform; label: string; icon: React.ElementType; ratio: string }> = [
  { value: "instagram_reels", label: "Instagram Reels", icon: Camera, ratio: "9:16" },
  { value: "tiktok",          label: "TikTok",          icon: Video,   ratio: "9:16" },
  { value: "youtube_shorts",  label: "YouTube Shorts",  icon: Video,  ratio: "16:9" },
];

const STEPS = ["Upload", "Configurar", "Revisar"];

export function VideoWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);

  // Step 1
  const [s3Key, setS3Key] = useState<string | null>(null);
  const [context, setContext] = useState("");
  const [useAsInspiration, setUseAsInspiration] = useState(true);

  // Step 2
  const [platform, setPlatform] = useState<Platform>("instagram_reels");
  const [duration, setDuration] = useState<Duration>(30);
  const [style, setStyle] = useState<Style>("realistic");
  const [cta, setCta] = useState("");
  const [voice, setVoice] = useState<Voice>("Camila");

  // Step 3
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const contextValid = context.length >= 10 && context.length <= 500;

  async function handleSubmit() {
    if (!s3Key) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/video/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawVideoS3Key: s3Key,
          platform,
          targetDuration: duration,
          visualStyle: style,
          ctaText: cta || undefined,
          narratorVoice: voice,
          contextDescription: context,
          useAsInspiration,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error ?? "Falha ao criar job de vídeo.");
      }

      const { jobId } = await res.json() as { jobId: string };
      router.push(`/video/${jobId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao iniciar geração.");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Step indicator */}
      <nav aria-label="Etapas">
        <ol className="flex items-center gap-2">
          {STEPS.map((label, idx) => {
            const isCompleted = step > idx;
            const isActive = step === idx;
            return (
              <li key={label} className="flex items-center gap-2">
                <div className="flex items-center gap-2">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-all ${
                    isCompleted ? "bg-blue-600 text-white"
                      : isActive ? "bg-blue-600 text-white ring-4 ring-blue-100"
                      : "bg-gray-100 text-gray-400"
                  }`}>
                    {isCompleted ? <CheckCircle2 className="h-4 w-4" /> : idx + 1}
                  </div>
                  <span className={`hidden sm:inline text-sm font-medium ${isActive ? "text-gray-900" : "text-gray-400"}`}>
                    {label}
                  </span>
                </div>
                {idx < STEPS.length - 1 && (
                  <div className={`h-px w-8 ${isCompleted ? "bg-blue-600" : "bg-gray-200"}`} />
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      {/* Step 0 — Upload */}
      {step === 0 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold mb-1">Passo 1 — Envie seu vídeo</h2>
            <p className="text-sm text-gray-500">Filme algo do seu negócio e envie. A IA vai transformá-lo em um reel profissional.</p>
          </div>

          <UploadDropzone onUploaded={(key) => setS3Key(key)} />

          {s3Key && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Descreva o contexto do vídeo</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Label htmlFor="context">O que aparece no vídeo? Para qual público?</Label>
                <textarea
                  id="context"
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder="Ex: Máquina nova de limpeza de pele para clínica de estética. Público feminino, 25-45 anos..."
                  className="flex w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 resize-none"
                />
                <p className={`text-xs ${context.length > 500 ? "text-red-500" : "text-gray-400"}`}>
                  {context.length}/500 caracteres
                </p>
              </CardContent>
            </Card>
          )}

          {/* Mode selector — shown after upload */}
          {s3Key && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Como deseja usar este vídeo?</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {/* Inspiration mode */}
                <button
                  type="button"
                  onClick={() => setUseAsInspiration(true)}
                  className={`flex flex-col items-start gap-2 rounded-xl border-2 p-4 text-left transition-all ${
                    useAsInspiration
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Lightbulb className={`h-5 w-5 ${useAsInspiration ? "text-blue-600" : "text-gray-400"}`} />
                    <span className="text-sm font-semibold text-gray-800">Apenas inspiração</span>
                  </div>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    A IA usa o vídeo como referência e <strong>gera cenas completamente novas</strong> com Stable Diffusion. Ideal para criar algo diferente do original.
                  </p>
                </button>

                {/* Polish mode */}
                <button
                  type="button"
                  onClick={() => setUseAsInspiration(false)}
                  className={`flex flex-col items-start gap-2 rounded-xl border-2 p-4 text-left transition-all ${
                    !useAsInspiration
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Scissors className={`h-5 w-5 ${!useAsInspiration ? "text-blue-600" : "text-gray-400"}`} />
                    <span className="text-sm font-semibold text-gray-800">Melhorar meu vídeo</span>
                  </div>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    Mantém <strong>suas próprias cenas</strong> e aplica cortes, grade de cor e narração profissional. Ideal para vídeos de academia, produto, etc.
                  </p>
                </button>
              </CardContent>
            </Card>
          )}

          <div className="flex justify-end">
            <Button
              variant="default"
              onClick={() => setStep(1)}
              disabled={!s3Key || !contextValid}
            >
              Continuar <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 1 — Config */}
      {step === 1 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold mb-1">Passo 2 — Configure o vídeo</h2>
            <p className="text-sm text-gray-500">Escolha a plataforma, duração e estilo do seu reel.</p>
          </div>

          {/* Platform */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Plataforma</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-3 gap-3">
              {PLATFORMS.map((p) => {
                const Icon = p.icon;
                return (
                  <button
                    key={p.value}
                    onClick={() => setPlatform(p.value)}
                    className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all ${
                      platform === p.value ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <Icon className="h-6 w-6 text-gray-600" />
                    <span className="text-xs font-medium text-gray-700">{p.label}</span>
                    <Badge className="text-xs bg-gray-100 text-gray-500">{p.ratio}</Badge>
                  </button>
                );
              })}
            </CardContent>
          </Card>

          {/* Duration */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Duração</CardTitle></CardHeader>
            <CardContent className="flex gap-3">
              {([15, 30, 60] as Duration[]).map((d) => (
                <button
                  key={d}
                  onClick={() => setDuration(d)}
                  className={`flex-1 py-3 rounded-xl border-2 text-sm font-semibold transition-all ${
                    duration === d ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-600 hover:border-gray-300"
                  }`}
                >
                  {d}s
                </button>
              ))}
            </CardContent>
          </Card>

          {/* Style */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Estilo visual</CardTitle></CardHeader>
            <CardContent className="flex gap-3">
              {(["realistic", "cinematic", "minimalist"] as Style[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setStyle(s)}
                  className={`flex-1 py-3 rounded-xl border-2 text-sm font-medium capitalize transition-all ${
                    style === s ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-600 hover:border-gray-300"
                  }`}
                >
                  {s === "realistic" ? "Realista" : s === "cinematic" ? "Cinematográfico" : "Minimalista"}
                </button>
              ))}
            </CardContent>
          </Card>

          {/* Voice */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Narração</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setVoice("Camila")}
                className={`py-3 rounded-xl border-2 text-sm font-medium transition-all ${voice === "Camila" ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-600"}`}
              >
                Camila (feminina)
              </button>
              <button
                onClick={() => setVoice("Ricardo")}
                className={`py-3 rounded-xl border-2 text-sm font-medium transition-all ${voice === "Ricardo" ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-600"}`}
              >
                Ricardo (masculino)
              </button>
            </CardContent>
          </Card>

          {/* CTA */}
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Chamada para ação (opcional)</CardTitle></CardHeader>
            <CardContent>
              <Input
                placeholder="Ex: Agende pelo WhatsApp, Acesse nosso site..."
                value={cta}
                onChange={(e) => setCta(e.target.value)}
                maxLength={80}
              />
            </CardContent>
          </Card>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(0)}>
              <ChevronLeft className="h-4 w-4" /> Voltar
            </Button>
            <Button variant="default" onClick={() => setStep(2)}>
              Continuar <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 2 — Review */}
      {step === 2 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold mb-1">Passo 3 — Confirmar e gerar</h2>
            <p className="text-sm text-gray-500">Revise as configurações. A geração consumirá 1 crédito de vídeo.</p>
          </div>

          <Card>
            <CardContent className="pt-6 space-y-3">
              <Row label="Plataforma" value={PLATFORMS.find((p) => p.value === platform)?.label ?? platform} />
              <Row label="Duração" value={`${duration} segundos`} />
              <Row label="Estilo" value={style === "realistic" ? "Realista" : style === "cinematic" ? "Cinematográfico" : "Minimalista"} />
              <Row label="Narração" value={`Voz ${voice}`} />
              <Row label="Modo" value={useAsInspiration ? "Apenas inspiração (cenas novas)" : "Melhorar meu vídeo (manter cenas)"} />
              {cta && <Row label="CTA" value={cta} />}
              <Separator />
              <Row label="Contexto" value={context} />
            </CardContent>
          </Card>

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(1)} disabled={loading}>
              <ChevronLeft className="h-4 w-4" /> Voltar
            </Button>
            <Button onClick={handleSubmit} disabled={loading}>
              {loading ? (
                <><RefreshCw className="h-4 w-4 animate-spin" /> Gerando...</>
              ) : (
                <><Rocket className="h-4 w-4" /> Gerar Vídeo</>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-start gap-4">
      <span className="text-sm text-gray-500 shrink-0">{label}</span>
      <span className="text-sm text-gray-900 text-right">{value}</span>
    </div>
  );
}
