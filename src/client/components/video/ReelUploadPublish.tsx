"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Video } from "lucide-react";
import { VideoUploadDropzone } from "@client/components/video/VideoUploadDropzone";
import { VideoPlatformSelector } from "@client/components/video/VideoPlatformSelector";
import { ScheduleAndSave } from "@client/components/video/ScheduleAndSave";
import { Card, CardContent, CardHeader, CardTitle } from "@client/components/ui/card";
import { Label } from "@client/components/ui/label";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ReelUploadPublishProps {
  onComplete?: () => void;
}

interface PlatformError {
  platform: string;
  message: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const CAPTION_MAX = 2200;

const PLATFORM_LABEL: Record<string, string> = {
  instagram: "Instagram Reels",
  tiktok: "TikTok",
  youtube: "YouTube Shorts",
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function ReelUploadPublish({ onComplete }: ReelUploadPublishProps) {
  const router = useRouter();

  // ── State ──────────────────────────────────────────────────────────────────
  const [videoFile, setVideoFile] = useState<{ url: string; name: string } | null>(null);
  const [caption, setCaption] = useState("");
  const [platforms, setPlatforms] = useState<string[]>([]);
  const [scheduledAt, setScheduledAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [platformErrors, setPlatformErrors] = useState<PlatformError[]>([]);

  // Validation state for submit attempt without required fields
  const [validationError, setValidationError] = useState<string>("");

  // ── Derived flags ──────────────────────────────────────────────────────────
  const hasVideo = videoFile !== null;
  const hasCaption = caption.trim().length > 0;
  const canSave = hasVideo && hasCaption;

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleUploaded = useCallback((file: { url: string; name: string }) => {
    setVideoFile(file);
    setValidationError("");
  }, []);

  const handleCaptionChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value;
      if (val.length <= CAPTION_MAX) {
        setCaption(val);
        if (val.trim().length > 0) setValidationError("");
      }
    },
    []
  );

  const handleCancel = useCallback(() => {
    // Reset form
    setVideoFile(null);
    setCaption("");
    setPlatforms([]);
    setScheduledAt("");
    setSaveError("");
    setPlatformErrors([]);
    setValidationError("");
    onComplete?.();
  }, [onComplete]);

  const handleSave = useCallback(async () => {
    // Validate required fields
    if (!hasVideo || !hasCaption) {
      const missing: string[] = [];
      if (!hasVideo) missing.push("vídeo");
      if (!hasCaption) missing.push("legenda");
      setValidationError(
        `Preencha os campos obrigatórios: ${missing.join(" e ")}.`
      );
      return;
    }

    setValidationError("");
    setSaveError("");
    setPlatformErrors([]);
    setSaving(true);

    try {
      const scheduledAtValue =
        scheduledAt.trim().length > 0 ? scheduledAt : undefined;

      if (platforms.length === 0) {
        // No platforms selected — save as draft (no platform field)
        const body: Record<string, unknown> = {
          content: caption,
          imageUrl: videoFile!.url,
          format: "reel",
        };
        if (scheduledAtValue) body.scheduledAt = scheduledAtValue;

        const res = await fetch("/api/posts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          setSaveError(data.error ?? "Erro ao salvar o rascunho.");
          return;
        }

        // Success — redirect
        onComplete?.();
        router.push("/posts");
        return;
      }

      // One or more platforms selected — call POST /api/posts per platform in parallel
      const results = await Promise.allSettled(
        platforms.map((platform) => {
          const body: Record<string, unknown> = {
            platform,
            content: caption,
            imageUrl: videoFile!.url,
            format: "reel",
          };
          if (scheduledAtValue) body.scheduledAt = scheduledAtValue;

          return fetch("/api/posts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }).then(async (res) => {
            if (!res.ok) {
              const data = (await res.json()) as { error?: string };
              throw new Error(data.error ?? `Erro ao salvar para ${platform}.`);
            }
            return res.json();
          });
        })
      );

      // Check for failures
      const errors: PlatformError[] = [];
      results.forEach((result, idx) => {
        if (result.status === "rejected") {
          const platform = platforms[idx] ?? "unknown";
          const msg =
            result.reason instanceof Error
              ? result.reason.message
              : "Erro desconhecido.";
          errors.push({
            platform,
            message: msg,
          });
        }
      });

      if (errors.length > 0) {
        // Some platforms failed — show per-platform errors and keep form open
        // Remove successfully saved platforms from the selection so user can retry only failures
        const failedPlatforms = errors.map((e) => e.platform);
        setPlatforms(failedPlatforms);
        setPlatformErrors(errors);
        return;
      }

      // All succeeded — redirect
      onComplete?.();
      router.push("/posts");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erro inesperado. Tente novamente.";
      setSaveError(message);
    } finally {
      setSaving(false);
    }
  }, [
    hasVideo,
    hasCaption,
    videoFile,
    caption,
    platforms,
    scheduledAt,
    router,
    onComplete,
  ]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base text-green-800">
            <Video className="h-4 w-4" />
            Upload + Publicar
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* 1. Video upload */}
          <div className="space-y-2">
            <Label>Vídeo *</Label>
            <VideoUploadDropzone onUploaded={handleUploaded} />
          </div>

          {/* 2. Manual caption */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="reel-caption">Legenda *</Label>
              <span
                className={`text-xs ${
                  caption.length >= CAPTION_MAX
                    ? "text-red-500 font-medium"
                    : "text-gray-400"
                }`}
              >
                {caption.length}/{CAPTION_MAX}
              </span>
            </div>
            <textarea
              id="reel-caption"
              value={caption}
              onChange={handleCaptionChange}
              placeholder="Escreva a legenda do seu reel..."
              rows={5}
              maxLength={CAPTION_MAX}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none resize-none"
            />
          </div>

          {/* Validation error */}
          {validationError && (
            <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {validationError}
            </div>
          )}

          {/* Per-platform errors (partial failure) */}
          {platformErrors.length > 0 && (
            <div className="p-3 bg-red-50 border border-red-100 rounded-lg space-y-1.5">
              <div className="flex items-center gap-2 text-sm font-medium text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                Falha ao salvar em algumas plataformas:
              </div>
              <ul className="space-y-1 pl-6 list-disc">
                {platformErrors.map((e) => (
                  <li key={e.platform} className="text-xs text-red-600">
                    <strong>{PLATFORM_LABEL[e.platform] ?? e.platform}</strong>:{" "}
                    {e.message}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-red-500 pt-1">
                As plataformas que foram salvas com sucesso não serão duplicadas.
                Corrija o erro e tente novamente somente para as plataformas listadas.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 3. Platform selector */}
      <VideoPlatformSelector platforms={platforms} setPlatforms={setPlatforms} />

      {/* 4. Schedule and save */}
      <ScheduleAndSave
        scheduledAt={scheduledAt}
        setScheduledAt={setScheduledAt}
        saving={saving}
        saveError={saveError}
        platforms={platforms}
        onSave={handleSave}
        onCancel={handleCancel}
        disabled={!canSave}
      />
    </div>
  );
}
