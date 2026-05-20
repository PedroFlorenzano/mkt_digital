"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2, Sparkles } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@client/components/ui/card";
import { Button } from "@client/components/ui/button";
import { Label } from "@client/components/ui/label";
import { Badge } from "@client/components/ui/badge";
import { VideoUploadDropzone } from "@client/components/video/VideoUploadDropzone";
import { VideoPlatformSelector } from "@client/components/video/VideoPlatformSelector";
import { ScheduleAndSave } from "@client/components/video/ScheduleAndSave";
import { buildFinalCaption } from "@client/lib/buildFinalCaption";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ReelCaptionWizardProps {
  onComplete?: () => void;
}

type WizardStep = 1 | 2 | 3;

// ─────────────────────────────────────────────────────────────────────────────
// Step Indicator
// ─────────────────────────────────────────────────────────────────────────────

const STEPS = [
  { num: 1 as const, label: "Upload do vídeo" },
  { num: 2 as const, label: "Gerar legenda" },
  { num: 3 as const, label: "Revisar e salvar" },
];

function StepIndicator({ currentStep }: { currentStep: WizardStep }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {STEPS.map(({ num, label }, idx) => (
        <div key={num} className="flex items-center gap-2">
          <div
            className={`flex items-center justify-center h-7 w-7 rounded-full text-xs font-semibold shrink-0 ${
              currentStep > num
                ? "bg-green-500 text-white"
                : currentStep === num
                ? "bg-purple-600 text-white"
                : "bg-gray-100 text-gray-400"
            }`}
          >
            {currentStep > num ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              num
            )}
          </div>
          <span
            className={`text-sm ${
              currentStep === num
                ? "text-gray-900 font-medium"
                : "text-gray-400"
            }`}
          >
            {label}
          </span>
          {idx < STEPS.length - 1 && (
            <div className="h-px w-8 bg-gray-200 mx-1 shrink-0" />
          )}
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function ReelCaptionWizard({ onComplete }: ReelCaptionWizardProps) {
  const router = useRouter();

  // ── Wizard step ────────────────────────────────────────────────────────────
  const [step, setStep] = useState<WizardStep>(1);

  // ── Step 1: Upload ─────────────────────────────────────────────────────────
  const [videoFile, setVideoFile] = useState<{
    url: string;
    name: string;
  } | null>(null);

  // ── Step 2: Caption generation ─────────────────────────────────────────────
  const [idea, setIdea] = useState("");
  const [platforms, setPlatforms] = useState<string[]>(["instagram"]);
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [loadingCaption, setLoadingCaption] = useState(false);
  const [captionError, setCaptionError] = useState("");

  // ── Step 3: Review & save ──────────────────────────────────────────────────
  const [editedCaption, setEditedCaption] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [platformErrors, setPlatformErrors] = useState<
    { platform: string; error: string }[]
  >([]);

  // ── Step 1 handler ─────────────────────────────────────────────────────────

  function handleUploaded(file: { url: string; name: string }) {
    setVideoFile(file);
    setStep(2);
  }

  // ── Step 2 handler ─────────────────────────────────────────────────────────

  async function handleGenerateCaption() {
    if (!videoFile) return;

    setCaptionError("");
    setLoadingCaption(true);

    try {
      const res = await fetch("/api/generate/reel-caption", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea, platform: platforms[0] }),
      });

      const data = (await res.json()) as {
        caption?: string;
        hashtags?: string[];
        error?: string;
      };

      if (!res.ok) {
        setCaptionError(
          data.error ?? "Erro ao gerar legenda. Tente novamente."
        );
        return;
      }

      const generatedCaption = data.caption ?? "";
      const generatedHashtags = data.hashtags ?? [];

      setHashtags(generatedHashtags);
      setEditedCaption(generatedCaption);
      setStep(3);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Erro ao gerar legenda. Tente novamente.";
      setCaptionError(message);
    } finally {
      setLoadingCaption(false);
    }
  }

  // ── Step 3 handler ─────────────────────────────────────────────────────────

  async function handleSave() {
    if (!videoFile || !editedCaption.trim()) return;

    setSaving(true);
    setSaveError("");
    setPlatformErrors([]);

    let finalCaption: string;
    try {
      finalCaption = buildFinalCaption(editedCaption, hashtags);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Legenda muito longa.";
      setSaveError(message);
      setSaving(false);
      return;
    }

    try {
      const results = await Promise.allSettled(
        platforms.map((platform) =>
          fetch("/api/posts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              platform,
              content: finalCaption,
              imageUrl: videoFile.url,
              format: "reel",
              scheduledAt: scheduledAt || undefined,
            }),
          }).then(async (res) => {
            if (!res.ok) {
              const data = (await res.json()) as { error?: string };
              throw new Error(data.error ?? `Erro ao salvar para ${platform}`);
            }
            return res.json();
          })
        )
      );

      const failures = results
        .map((r, i) => ({ result: r, platform: platforms[i]! }))
        .filter(({ result }) => result.status === "rejected");

      if (failures.length > 0) {
        const failedPlatforms = failures.map(({ platform }) => platform);
        // Narrow platforms to only the failed ones so a retry doesn't duplicate
        // posts that were already created successfully on other platforms.
        setPlatforms(failedPlatforms);
        setPlatformErrors(
          failures.map(({ platform, result }) => ({
            platform,
            error:
              ((result as PromiseRejectedResult).reason as Error)?.message ??
              "Erro desconhecido",
          }))
        );
        return;
      }

      // Full success — redirect or call completion callback
      if (onComplete) {
        onComplete();
      } else {
        router.push("/posts");
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erro inesperado ao salvar.";
      setSaveError(message);
    } finally {
      setSaving(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Step progress indicator */}
      <StepIndicator currentStep={step} />

      {/* ── STEP 1: Upload ── */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Upload do vídeo</CardTitle>
          </CardHeader>
          <CardContent>
            <VideoUploadDropzone onUploaded={handleUploaded} />
          </CardContent>
        </Card>
      )}

      {/* ── STEP 2: Generate caption ── */}
      {step === 2 && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Gerar legenda com IA</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Upload success confirmation */}
              {videoFile && (
                <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>
                    Vídeo pronto:{" "}
                    <strong className="truncate max-w-[200px] inline-block align-bottom">
                      {videoFile.name}
                    </strong>
                  </span>
                </div>
              )}

              {/* Idea field */}
              <div className="space-y-1.5">
                <Label htmlFor="idea">
                  Ideia ou contexto do vídeo (opcional)
                </Label>
                <textarea
                  id="idea"
                  value={idea}
                  onChange={(e) => setIdea(e.target.value)}
                  maxLength={500}
                  placeholder="Descreva o conteúdo do vídeo ou a mensagem que deseja transmitir..."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none resize-none"
                />
                <p className="text-xs text-gray-400 text-right">
                  {idea.length}/500
                </p>
              </div>

              {/* Caption generation error */}
              {captionError && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{captionError}</span>
                </div>
              )}

              {/* Generate button */}
              <Button
                variant="default"
                onClick={() => void handleGenerateCaption()}
                disabled={!videoFile || loadingCaption}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white"
              >
                {loadingCaption ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Gerando legenda...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Gerar Legenda
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Platform selector */}
          <VideoPlatformSelector
            platforms={platforms}
            setPlatforms={setPlatforms}
          />
        </div>
      )}

      {/* ── STEP 3: Review & save ── */}
      {step === 3 && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Revisar e editar legenda</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Editable caption textarea */}
              <div className="space-y-1.5">
                <Label htmlFor="editedCaption">Legenda</Label>
                <textarea
                  id="editedCaption"
                  value={editedCaption}
                  onChange={(e) => setEditedCaption(e.target.value)}
                  rows={6}
                  placeholder="Legenda do reel..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none resize-none"
                />
              </div>

              {/* Hashtags as badges */}
              {hashtags.length > 0 && (
                <div className="space-y-1.5">
                  <Label>Hashtags</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {hashtags.map((tag) => (
                      <Badge
                        key={tag}
                        variant="secondary"
                        className="text-xs font-normal"
                      >
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Per-platform save errors */}
              {platformErrors.length > 0 && (
                <div className="space-y-1.5 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <div className="flex items-center gap-2 text-sm font-medium text-red-700">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>Falha ao salvar para algumas plataformas:</span>
                  </div>
                  <ul className="space-y-1 text-sm text-red-600 ml-6 list-disc">
                    {platformErrors.map(({ platform, error }) => (
                      <li key={platform}>
                        <strong>{platform}</strong>: {error}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Schedule & save */}
          <ScheduleAndSave
            scheduledAt={scheduledAt}
            setScheduledAt={setScheduledAt}
            saving={saving}
            saveError={saveError}
            platforms={platforms}
            onSave={() => void handleSave()}
            onCancel={() => setStep(2)}
            disabled={!editedCaption.trim()}
          />
        </div>
      )}
    </div>
  );
}
