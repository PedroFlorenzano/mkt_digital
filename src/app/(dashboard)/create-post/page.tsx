"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  Sparkles, Loader2, TrendingUp, Upload, X, Check,
  Type, ImageIcon, Save, Calendar, AlertCircle, Video,
  Wand2, FileImage, Send,
} from "lucide-react";
import { DashboardLayout } from "@client/components/layout/dashboard-layout";
import { Button } from "@client/components/ui/button";
import { Badge } from "@client/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@client/components/ui/card";
import { Input } from "@client/components/ui/input";
import { Label } from "@client/components/ui/label";
import { cn } from "@server/lib/utils";
import { CarouselEditor } from "@client/components/CarouselEditor";
import { VariationsPanel } from "@client/components/VariationsPanel";
import type { Slide } from "@server/services/carousel.service";

// ─────────────────────────────────────────────────────────────────────────────
// Types & constants
// ─────────────────────────────────────────────────────────────────────────────

interface TextOption { title: string; content: string; }
interface TrendItem { title: string; source: string; }

type WorkflowMode = "ai" | "text-only" | "manual";

const PLATFORMS = [
  { id: "instagram", label: "Instagram", emoji: "📸", color: "text-pink-500",  activeBorder: "border-pink-500",  activeBg: "bg-pink-50" },
  { id: "facebook",  label: "Facebook",  emoji: "📘", color: "text-blue-600",  activeBorder: "border-blue-600",  activeBg: "bg-blue-50" },
  { id: "linkedin",  label: "LinkedIn",  emoji: "💼", color: "text-blue-700",  activeBorder: "border-sky-600",   activeBg: "bg-sky-50"  },
  { id: "tiktok",    label: "TikTok",    emoji: "🎵", color: "text-gray-900",  activeBorder: "border-gray-700",  activeBg: "bg-gray-100" },
  { id: "whatsapp",  label: "WhatsApp",  emoji: "💬", color: "text-green-600", activeBorder: "border-green-600", activeBg: "bg-green-50" },
];

const ALL_PLATFORM_IDS = PLATFORMS.map((p) => p.id);

// ─────────────────────────────────────────────────────────────────────────────
// PlatformSelector — shared across all modes
// ─────────────────────────────────────────────────────────────────────────────

function PlatformSelector({
  platforms,
  setPlatforms,
}: {
  platforms: string[];
  setPlatforms: (v: string[]) => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Plataformas</CardTitle>
          <button
            onClick={() =>
              setPlatforms(
                platforms.length === ALL_PLATFORM_IDS.length ? ["instagram"] : ALL_PLATFORM_IDS,
              )
            }
            className="text-xs text-blue-600 hover:text-blue-700 font-medium"
          >
            {platforms.length === ALL_PLATFORM_IDS.length ? "Desmarcar todas" : "Selecionar todas"}
          </button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          {PLATFORMS.map((p) => {
            const selected = platforms.includes(p.id);
            return (
              <button
                key={p.id}
                onClick={() =>
                  setPlatforms(
                    selected
                      ? platforms.length > 1 ? platforms.filter((x) => x !== p.id) : platforms
                      : [...platforms, p.id],
                  )
                }
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-2 rounded-lg border text-sm font-medium transition-all min-w-0",
                  selected
                    ? `${p.activeBorder} ${p.activeBg} ${p.color}`
                    : "border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50",
                )}
              >
                <span className="text-base leading-none shrink-0">{p.emoji}</span>
                <span className="truncate">{p.label}</span>
                {selected && <Check className="h-3 w-3 ml-auto shrink-0" />}
              </button>
            );
          })}
        </div>
        {platforms.includes("whatsapp") && (
          <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
            <AlertCircle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 leading-snug">
              <strong>WhatsApp:</strong> broadcast para contatos. Status não é suportado pela API.
            </p>
          </div>
        )}
        {platforms.includes("tiktok") && (
          <div className="flex items-start gap-2 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2">
            <AlertCircle className="h-3.5 w-3.5 text-gray-500 shrink-0 mt-0.5" />
            <p className="text-xs text-gray-600 leading-snug">
              <strong>TikTok:</strong> apenas vídeo e carrossel. Requer app aprovado no Developer Portal.
            </p>
          </div>
        )}
        {platforms.length > 1 && (
          <p className="text-xs text-gray-500">
            {platforms.length} posts serão criados (um por plataforma).
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ScheduleAndSave — shared save section
// ─────────────────────────────────────────────────────────────────────────────

function ScheduleAndSave({
  scheduledAt,
  setScheduledAt,
  saving,
  saveError,
  platforms,
  onSave,
  onCancel,
  disabled,
}: {
  scheduledAt: string;
  setScheduledAt: (v: string) => void;
  saving: boolean;
  saveError: string;
  platforms: string[];
  onSave: () => void;
  onCancel: () => void;
  disabled?: boolean;
}) {
  return (
    <Card className="border-green-200 bg-green-50/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-base text-green-800">Agendamento e publicação</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-gray-400" />
            Agendar publicação (opcional)
          </Label>
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          />
          <p className="text-xs text-gray-400">
            Sem data: salva como rascunho. Com data: agenda automaticamente.
          </p>
        </div>

        {saveError && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-600">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {saveError}
          </div>
        )}

        <div className="flex gap-3">
          <Button variant="outline" onClick={onCancel} disabled={saving}>
            Cancelar
          </Button>
          <Button variant="gradient" onClick={onSave} disabled={saving || disabled} className="flex-1">
            {saving ? (
              <><Loader2 className="h-4 w-4 animate-spin" />Salvando...</>
            ) : scheduledAt ? (
              <><Calendar className="h-4 w-4" />Agendar {platforms.length > 1 ? `em ${platforms.length} redes` : "post"}</>
            ) : (
              <><Save className="h-4 w-4" />Salvar {platforms.length > 1 ? `em ${platforms.length} redes` : "post"}</>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function CreatePostPage() {
  const { data: session } = useSession();
  const router = useRouter();

  // ── Workflow mode ──────────────────────────────────────────────────────────
  const [workflowMode, setWorkflowMode] = useState<WorkflowMode>("ai");

  // ── Shared state ──────────────────────────────────────────────────────────
  const [platforms, setPlatforms] = useState<string[]>(["instagram"]);
  const primaryPlatform = platforms[0] ?? "instagram";
  const [scheduledAt, setScheduledAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  // ── AI mode state ─────────────────────────────────────────────────────────
  const [idea, setIdea] = useState("");
  const [additionalContext, setAdditionalContext] = useState("");
  const [trendingContext, setTrendingContext] = useState("");
  const [style, setStyle] = useState("");
  const [hasLogo, setHasLogo] = useState(false);
  const [includeLogo, setIncludeLogo] = useState(true);
  const [addTextOverlay, setAddTextOverlay] = useState(false);
  const [overlayHeadline, setOverlayHeadline] = useState("");
  const [overlayBody, setOverlayBody] = useState("");
  const [overlayPosition, _setOverlayPosition] = useState<"bottom" | "top" | "center">("bottom");
  const [layoutTemplate, setLayoutTemplate] = useState<"gradient-bottom" | "text-top" | "text-center" | "text-left">("gradient-bottom");
  const [textOptions, setTextOptions] = useState<TextOption[]>([]);
  const [imageOptions, setImageOptions] = useState<string[]>([]);
  const [selectedText, setSelectedText] = useState<number | null>(null);
  const [selectedImage, setSelectedImage] = useState<number | null>(null);
  const [loadingText, setLoadingText] = useState(false);
  const [loadingImage, setLoadingImage] = useState(false);
  const [aiError, setAiError] = useState("");
  const [textCost, setTextCost] = useState<{ inputTokens: number; outputTokens: number; costUsd: number } | null>(null);
  const [imageCost, setImageCost] = useState<{ imagesGenerated: number; costUsd: number } | null>(null);
  const [refImages, setRefImages] = useState<{ url: string; name: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [trends, setTrends] = useState<TrendItem[]>([]);
  const [loadingTrends, setLoadingTrends] = useState(false);
  const [showTrends, setShowTrends] = useState(false);

  // AI format sub-modes
  const [format, setFormat] = useState<"post" | "reel" | "story" | "carousel">("post");
  const [videoUrl, setVideoUrl] = useState("");
  const [reelCaption, setReelCaption] = useState("");
  const [reelHashtags, setReelHashtags] = useState<string[]>([]);
  const [loadingCaption, setLoadingCaption] = useState(false);
  const [storyImage, setStoryImage] = useState("");
  const [loadingStory, setLoadingStory] = useState(false);
  const [carouselSlides, setCarouselSlides] = useState<Slide[]>([]);
  const [_carouselPostId, setCarouselPostId] = useState("");
  const [slideCount, setSlideCount] = useState(5);
  const [loadingCarousel, setLoadingCarousel] = useState(false);

  // ── Text-only mode state ───────────────────────────────────────────────────
  // User uploads their own media, AI generates only the caption
  const [textOnlyMedia, setTextOnlyMedia] = useState<{ url: string; name: string } | null>(null);
  const [textOnlyMediaType, setTextOnlyMediaType] = useState<"image" | "video">("image");
  const [textOnlyIdea, setTextOnlyIdea] = useState("");
  const [textOnlyOptions, setTextOnlyOptions] = useState<TextOption[]>([]);
  const [textOnlySelected, setTextOnlySelected] = useState<number | null>(null);
  const [loadingTextOnly, setLoadingTextOnly] = useState(false);
  const [textOnlyError, setTextOnlyError] = useState("");
  const [uploadingTextOnly, setUploadingTextOnly] = useState(false);

  // ── Manual mode state ─────────────────────────────────────────────────────
  // User brings both media and text — just schedule/publish
  const [manualMedia, setManualMedia] = useState<{ url: string; name: string } | null>(null);
  const [manualText, setManualText] = useState("");
  const [uploadingManual, setUploadingManual] = useState(false);
  const [manualError, setManualError] = useState("");

  // ── Effects ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!session) return;
    fetch("/api/company")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        const logo = Boolean(d?.logoUrl);
        setHasLogo(logo);
        setIncludeLogo(logo);
      })
      .catch(() => {});
  }, [session]);

  // ── Shared save function ──────────────────────────────────────────────────
  async function savePosts(content: string | null, imageUrl: string | null, extra: Record<string, unknown> = {}) {
    setSaving(true);
    setSaveError("");
    try {
      await Promise.all(
        platforms.map((p) =>
          fetch("/api/posts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              platform: p,
              content,
              imageUrl,
              scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
              ...extra,
            }),
          }).then(async (res) => {
            const data = await res.json();
            if (!res.ok) throw new Error(`${p}: ${data.error ?? "Erro ao salvar"}`);
          }),
        ),
      );
      router.push("/posts");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  // ── AI mode functions ─────────────────────────────────────────────────────
  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files?.length) return;
    setUploading(true);
    const form = new FormData();
    Array.from(files).forEach((f) => form.append("files", f));
    try {
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setRefImages((prev) => [...prev, ...data.files]);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Erro no upload");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function fetchTrends() {
    setLoadingTrends(true);
    try {
      const res = await fetch("/api/trends");
      const data = await res.json();
      if (res.ok) {
        setTrends([...(data.trends ?? []), ...(data.news ?? []), ...(data.tech ?? [])]);
        setShowTrends(true);
      }
    } catch { setAiError("Erro ao buscar trending topics"); }
    finally { setLoadingTrends(false); }
  }

  function selectTrend(t: TrendItem) {
    const line = `- ${t.title} (${t.source})`;
    setAdditionalContext((p) => p ? `${p}\n${line}` : line);
    setTrendingContext((p) => p ? `${p}\n${line}` : line);
    setShowTrends(false);
  }

  async function generateReelCaption() {
    setLoadingCaption(true);
    setAiError("");
    setReelCaption("");
    setReelHashtags([]);
    try {
      const res = await fetch("/api/generate/reel-caption", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea, platform: primaryPlatform }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setReelCaption(data.caption ?? "");
      setReelHashtags(data.hashtags ?? []);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Erro ao gerar legenda");
    } finally { setLoadingCaption(false); }
  }

  async function generateStory() {
    setLoadingStory(true);
    setAiError("");
    setStoryImage("");
    try {
      const res = await fetch("/api/generate/story", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea, scheduledAt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStoryImage(data.imageUrl ?? "");
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Erro ao gerar story");
    } finally { setLoadingStory(false); }
  }

  async function generateText() {
    setLoadingText(true);
    setAiError("");
    setTextOptions([]);
    setSelectedText(null);
    try {
      const res = await fetch("/api/generate/text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: primaryPlatform, idea, topic: additionalContext, trendingContext: trendingContext || additionalContext, referenceImages: refImages.map((i) => i.url) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTextOptions(data.options);
      if (data.usage) setTextCost(data.usage);
    } catch (err) { setAiError(err instanceof Error ? err.message : "Erro ao gerar texto"); }
    finally { setLoadingText(false); }
  }

  async function generateImages() {
    setLoadingImage(true);
    setAiError("");
    try {
      const res = await fetch("/api/generate/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: primaryPlatform, idea, style, includeLogo, referenceContext: refImages.length > 0 ? `${refImages.length} reference images` : "", trendingContext: trendingContext || additionalContext, addTextOverlay, overlayHeadline: addTextOverlay ? overlayHeadline : "", overlayBody: addTextOverlay ? overlayBody : "", overlayPosition, layoutTemplate }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setImageOptions((prev) => [...prev, ...(data.images ?? [])]);
      if (data.usage) setImageCost(data.usage);
    } catch (err) { setAiError(err instanceof Error ? err.message : "Erro ao gerar imagens"); }
    finally { setLoadingImage(false); }
  }

  async function generateCarousel() {
    setLoadingCarousel(true);
    setAiError("");
    setCarouselSlides([]);
    setCarouselPostId("");
    try {
      const res = await fetch("/api/generate/carousel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea, slideCount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCarouselSlides(data.slides ?? []);
      setCarouselPostId(data.postId ?? "");
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "Erro ao gerar carrossel");
    } finally { setLoadingCarousel(false); }
  }

  // ── Text-only mode functions ──────────────────────────────────────────────

  async function uploadTextOnlyMedia(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingTextOnly(true);
    setTextOnlyError("");
    const isVideo = file.type.startsWith("video/");
    setTextOnlyMediaType(isVideo ? "video" : "image");
    const form = new FormData();
    form.append("files", file);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTextOnlyMedia(data.files[0]);
    } catch (err) {
      setTextOnlyError(err instanceof Error ? err.message : "Erro no upload");
    } finally {
      setUploadingTextOnly(false);
      e.target.value = "";
    }
  }

  async function generateTextForMedia() {
    setLoadingTextOnly(true);
    setTextOnlyError("");
    setTextOnlyOptions([]);
    setTextOnlySelected(null);
    try {
      const res = await fetch("/api/generate/text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: primaryPlatform,
          idea: textOnlyIdea || `Post sobre ${textOnlyMedia?.name ?? "esta mídia"}`,
          referenceImages: textOnlyMediaType === "image" && textOnlyMedia ? [textOnlyMedia.url] : [],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTextOnlyOptions(data.options ?? []);
    } catch (err) {
      setTextOnlyError(err instanceof Error ? err.message : "Erro ao gerar texto");
    } finally {
      setLoadingTextOnly(false);
    }
  }

  // ── Manual mode functions ─────────────────────────────────────────────────

  async function uploadManualMedia(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingManual(true);
    setManualError("");
    const form = new FormData();
    form.append("files", file);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setManualMedia(data.files[0]);
    } catch (err) {
      setManualError(err instanceof Error ? err.message : "Erro no upload");
    } finally {
      setUploadingManual(false);
      e.target.value = "";
    }
  }

  if (!session) return null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <DashboardLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Criar novo post</h1>
        <p className="text-gray-500 mt-1">Escolha como prefere criar seu conteúdo</p>
      </div>

      {/* ── Workflow mode selector ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <button
          onClick={() => setWorkflowMode("ai")}
          className={cn(
            "flex flex-col items-start gap-2 p-4 rounded-xl border-2 text-left transition-all",
            workflowMode === "ai"
              ? "border-blue-600 bg-blue-50"
              : "border-gray-200 hover:border-gray-300 hover:bg-gray-50",
          )}
        >
          <div className="flex items-center gap-2">
            <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", workflowMode === "ai" ? "bg-blue-600" : "bg-gray-100")}>
              <Wand2 className={cn("h-4 w-4", workflowMode === "ai" ? "text-white" : "text-gray-500")} />
            </div>
            <span className={cn("font-semibold text-sm", workflowMode === "ai" ? "text-blue-800" : "text-gray-700")}>IA completa</span>
            {workflowMode === "ai" && <Check className="h-4 w-4 text-blue-600 ml-auto" />}
          </div>
          <p className="text-xs text-gray-500 leading-relaxed">
            A IA cria texto e imagem do zero com base na sua ideia.
          </p>
        </button>

        <button
          onClick={() => setWorkflowMode("text-only")}
          className={cn(
            "flex flex-col items-start gap-2 p-4 rounded-xl border-2 text-left transition-all",
            workflowMode === "text-only"
              ? "border-purple-600 bg-purple-50"
              : "border-gray-200 hover:border-gray-300 hover:bg-gray-50",
          )}
        >
          <div className="flex items-center gap-2">
            <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", workflowMode === "text-only" ? "bg-purple-600" : "bg-gray-100")}>
              <Type className={cn("h-4 w-4", workflowMode === "text-only" ? "text-white" : "text-gray-500")} />
            </div>
            <span className={cn("font-semibold text-sm", workflowMode === "text-only" ? "text-purple-800" : "text-gray-700")}>Minha mídia + texto IA</span>
            {workflowMode === "text-only" && <Check className="h-4 w-4 text-purple-600 ml-auto" />}
          </div>
          <p className="text-xs text-gray-500 leading-relaxed">
            Você sobe a foto ou vídeo. A IA só gera a legenda e hashtags.
          </p>
        </button>

        <button
          onClick={() => setWorkflowMode("manual")}
          className={cn(
            "flex flex-col items-start gap-2 p-4 rounded-xl border-2 text-left transition-all",
            workflowMode === "manual"
              ? "border-green-600 bg-green-50"
              : "border-gray-200 hover:border-gray-300 hover:bg-gray-50",
          )}
        >
          <div className="flex items-center gap-2">
            <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", workflowMode === "manual" ? "bg-green-600" : "bg-gray-100")}>
              <Send className={cn("h-4 w-4", workflowMode === "manual" ? "text-white" : "text-gray-500")} />
            </div>
            <span className={cn("font-semibold text-sm", workflowMode === "manual" ? "text-green-800" : "text-gray-700")}>Pronto — só publicar</span>
            {workflowMode === "manual" && <Check className="h-4 w-4 text-green-600 ml-auto" />}
          </div>
          <p className="text-xs text-gray-500 leading-relaxed">
            Você já tem imagem e texto. Só agendar e publicar.
          </p>
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          MODE: TEXT-ONLY (upload media → AI caption)
      ══════════════════════════════════════════════════════════════════════ */}
      {workflowMode === "text-only" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-4">
            <PlatformSelector platforms={platforms} setPlatforms={setPlatforms} />

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Sua mídia</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {textOnlyMedia ? (
                  <div className="relative rounded-xl border border-gray-200 overflow-hidden bg-gray-50">
                    {textOnlyMediaType === "image" ? (
                      <div className="relative w-full aspect-square">
                        <Image src={textOnlyMedia.url} alt="Mídia" fill sizes="300px" className="object-cover" unoptimized />
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 p-3">
                        <Video className="h-8 w-8 text-gray-400 shrink-0" />
                        <div>
                          <p className="text-sm font-medium text-gray-700 truncate">{textOnlyMedia.name}</p>
                          <p className="text-xs text-gray-400">Vídeo pronto para usar</p>
                        </div>
                      </div>
                    )}
                    <button
                      onClick={() => setTextOnlyMedia(null)}
                      className="absolute top-2 right-2 h-6 w-6 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-xl p-8 cursor-pointer hover:border-purple-400 hover:bg-purple-50/30 transition-all">
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,video/mp4,video/mov,video/quicktime"
                      onChange={uploadTextOnlyMedia}
                      className="hidden"
                      disabled={uploadingTextOnly}
                    />
                    {uploadingTextOnly ? (
                      <Loader2 className="h-8 w-8 animate-spin text-purple-500 mb-2" />
                    ) : (
                      <Upload className="h-8 w-8 text-gray-300 mb-2" />
                    )}
                    <p className="text-sm text-gray-500 font-medium">Clique para enviar foto ou vídeo</p>
                    <p className="text-xs text-gray-400 mt-1">PNG, JPG, WebP, MP4 até 10MB</p>
                  </label>
                )}

                <div className="space-y-1.5">
                  <Label>Sobre o que é esse post? (opcional)</Label>
                  <textarea
                    value={textOnlyIdea}
                    onChange={(e) => setTextOnlyIdea(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white placeholder-gray-400 focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none resize-none"
                    rows={2}
                    placeholder="Ex: lançamento do produto X, promoção de fim de semana..."
                  />
                </div>

                <Button
                  onClick={generateTextForMedia}
                  disabled={!textOnlyMedia || loadingTextOnly}
                  className="w-full gap-2 bg-purple-600 hover:bg-purple-700 text-white"
                >
                  {loadingTextOnly ? (
                    <><Loader2 className="h-4 w-4 animate-spin" />Gerando texto...</>
                  ) : (
                    <><Sparkles className="h-4 w-4" />Gerar legenda com IA</>
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-2 space-y-4">
            {textOnlyError && (
              <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-100 rounded-xl text-sm text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                {textOnlyError}
              </div>
            )}

            {loadingTextOnly && (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <div className="relative mb-4">
                    <div className="h-12 w-12 animate-spin rounded-full border-4 border-purple-100 border-t-purple-600" />
                    <Sparkles className="absolute inset-0 m-auto h-5 w-5 text-purple-600" />
                  </div>
                  <p className="text-gray-600 font-medium">Gerando 3 opções de legenda...</p>
                </CardContent>
              </Card>
            )}

            {textOnlyOptions.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Type className="h-4 w-4 text-purple-600" />
                    Escolha a legenda
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {textOnlyOptions.map((opt, i) => (
                    <button
                      key={i}
                      onClick={() => setTextOnlySelected(i)}
                      className={cn(
                        "w-full p-4 rounded-xl border-2 text-left transition-all",
                        textOnlySelected === i ? "border-purple-600 bg-purple-50" : "border-gray-200 hover:border-gray-300 hover:bg-gray-50",
                      )}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-semibold text-gray-900">Opção {i + 1}: {opt.title}</span>
                        {textOnlySelected === i && <Badge variant="default" className="gap-1 bg-purple-600"><Check className="h-3 w-3" />Selecionado</Badge>}
                      </div>
                      <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">{opt.content}</p>
                    </button>
                  ))}
                </CardContent>
              </Card>
            )}

            {textOnlyOptions.length > 0 && textOnlySelected !== null && textOnlyMedia && (
              <ScheduleAndSave
                scheduledAt={scheduledAt}
                setScheduledAt={setScheduledAt}
                saving={saving}
                saveError={saveError}
                platforms={platforms}
                onCancel={() => router.push("/dashboard")}
                onSave={() =>
                  savePosts(
                    textOnlyOptions[textOnlySelected]?.content ?? null,
                    textOnlyMedia.url,
                    {
                      textVariants: textOnlyOptions,
                      selectedTextIndex: textOnlySelected,
                    },
                  )
                }
              />
            )}

            {!loadingTextOnly && textOnlyOptions.length === 0 && (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-100 to-pink-100 mb-4">
                    <Type className="h-8 w-8 text-purple-600" />
                  </div>
                  <p className="text-gray-600 font-medium mb-1">Suba sua mídia e gere a legenda</p>
                  <p className="text-gray-400 text-sm">Foto ou vídeo → IA cria 3 opções de texto para você escolher</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          MODE: MANUAL (ready content → just schedule & publish)
      ══════════════════════════════════════════════════════════════════════ */}
      {workflowMode === "manual" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <PlatformSelector platforms={platforms} setPlatforms={setPlatforms} />

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Mídia (opcional)</CardTitle>
              </CardHeader>
              <CardContent>
                {manualMedia ? (
                  <div className="relative rounded-xl border border-gray-200 overflow-hidden bg-gray-50">
                    <div className="relative w-full aspect-video bg-gray-100 flex items-center justify-center">
                      {manualMedia.url.match(/\.(mp4|mov|avi|webm)$/i) ? (
                        <div className="flex flex-col items-center gap-2 p-4 text-gray-500">
                          <Video className="h-10 w-10" />
                          <p className="text-sm">{manualMedia.name}</p>
                        </div>
                      ) : (
                        <Image src={manualMedia.url} alt="Mídia" fill sizes="500px" className="object-cover" unoptimized />
                      )}
                    </div>
                    <button
                      onClick={() => setManualMedia(null)}
                      className="absolute top-2 right-2 h-6 w-6 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-xl p-8 cursor-pointer hover:border-green-400 hover:bg-green-50/30 transition-all">
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,video/mp4,video/mov,video/quicktime"
                      onChange={uploadManualMedia}
                      className="hidden"
                      disabled={uploadingManual}
                    />
                    {uploadingManual ? (
                      <Loader2 className="h-8 w-8 animate-spin text-green-500 mb-2" />
                    ) : (
                      <FileImage className="h-8 w-8 text-gray-300 mb-2" />
                    )}
                    <p className="text-sm text-gray-500 font-medium">Clique para enviar foto ou vídeo</p>
                    <p className="text-xs text-gray-400 mt-1">PNG, JPG, WebP, MP4 até 10MB</p>
                  </label>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Texto / legenda</CardTitle>
              </CardHeader>
              <CardContent>
                <textarea
                  value={manualText}
                  onChange={(e) => setManualText(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white placeholder-gray-400 focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none resize-none"
                  rows={6}
                  placeholder="Cole aqui o texto do seu post, legenda, hashtags..."
                />
                <p className="text-xs text-gray-400 mt-1">{manualText.length} caracteres</p>
              </CardContent>
            </Card>

            {manualError && (
              <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-100 rounded-xl text-sm text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                {manualError}
              </div>
            )}
          </div>

          <div className="space-y-4">
            {/* Preview */}
            {(manualMedia || manualText) && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Preview</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="max-w-sm mx-auto border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
                    {manualMedia && !manualMedia.url.match(/\.(mp4|mov|avi|webm)$/i) && (
                      <div className="relative w-full aspect-square bg-gray-100">
                        <Image src={manualMedia.url} alt="Preview" fill sizes="400px" className="object-cover" unoptimized />
                      </div>
                    )}
                    {manualMedia && manualMedia.url.match(/\.(mp4|mov|avi|webm)$/i) && (
                      <div className="flex items-center gap-3 p-3 bg-gray-50 border-b border-gray-100">
                        <Video className="h-5 w-5 text-gray-400" />
                        <span className="text-sm text-gray-600">{manualMedia.name}</span>
                      </div>
                    )}
                    {manualText && (
                      <div className="p-4">
                        <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{manualText}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            <ScheduleAndSave
              scheduledAt={scheduledAt}
              setScheduledAt={setScheduledAt}
              saving={saving}
              saveError={saveError}
              platforms={platforms}
              disabled={!manualText && !manualMedia}
              onCancel={() => router.push("/dashboard")}
              onSave={() =>
                savePosts(manualText || null, manualMedia?.url ?? null)
              }
            />

            {!manualMedia && !manualText && (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-green-100 to-teal-100 mb-4">
                    <Send className="h-7 w-7 text-green-600" />
                  </div>
                  <p className="text-gray-600 font-medium mb-1">Post pronto para publicar</p>
                  <p className="text-gray-400 text-sm">Envie sua mídia e/ou escreva o texto, depois agende ou publique</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          MODE: AI FULL (original flow — IA generates text + image)
      ══════════════════════════════════════════════════════════════════════ */}
      {workflowMode === "ai" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Config */}
          <div className="lg:col-span-1 space-y-4">
            <PlatformSelector platforms={platforms} setPlatforms={setPlatforms} />

            {/* Format selector */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Formato</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-2">
                {(["post", "reel", "story", "carousel"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFormat(f)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all",
                      format === f ? "border-blue-600 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50",
                    )}
                  >
                    {f === "post" && "📝 Post"}
                    {f === "reel" && "🎬 Reel"}
                    {f === "story" && "📖 Story"}
                    {f === "carousel" && "🎠 Carrossel"}
                  </button>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Configurações</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Ideia do post</Label>
                  <textarea
                    value={idea}
                    onChange={(e) => setIdea(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none"
                    rows={3}
                    placeholder="Descreva a ideia ou deixe em branco..."
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label>Contexto adicional</Label>
                    <Button variant="ghost" size="sm" onClick={fetchTrends} disabled={loadingTrends} className="h-6 text-xs text-orange-600 hover:text-orange-700 hover:bg-orange-50 px-2">
                      {loadingTrends ? <Loader2 className="h-3 w-3 animate-spin" /> : <TrendingUp className="h-3 w-3" />}
                      Trending
                    </Button>
                  </div>
                  <textarea
                    value={additionalContext}
                    onChange={(e) => { setAdditionalContext(e.target.value); setTrendingContext(e.target.value); }}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none"
                    rows={3}
                    placeholder="Tema, contexto ou assunto do momento..."
                  />
                  {trendingContext && (
                    <p className="text-xs text-green-600 flex items-center gap-1">
                      <Check className="h-3 w-3" />
                      {trendingContext.split("\n").length} linha(s) de contexto
                    </p>
                  )}
                </div>

                {showTrends && trends.length > 0 && (
                  <div className="border border-orange-200 bg-orange-50 rounded-xl p-3 max-h-48 overflow-y-auto">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-orange-800">Em alta agora</span>
                      <button onClick={() => setShowTrends(false)} className="text-orange-500 hover:text-orange-700">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {trends.map((t, i) => (
                      <button key={i} onClick={() => selectTrend(t)} className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-orange-100 transition text-xs">
                        <span className="text-gray-800">{t.title}</span>
                        <span className="text-orange-500 ml-1.5">({t.source})</span>
                      </button>
                    ))}
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label>Estilo da imagem</Label>
                  <Input value={style} onChange={(e) => setStyle(e.target.value)} placeholder="Ex: minimalista, colorido..." />
                </div>

                <div className="space-y-2 pt-1 border-t border-gray-100">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={addTextOverlay}
                      onChange={(e) => setAddTextOverlay(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600"
                    />
                    <span className="text-sm font-medium text-gray-700">Adicionar texto na imagem</span>
                  </label>
                  {addTextOverlay && (
                    <div className="space-y-2 pl-6">
                      <div className="space-y-1">
                        <Label className="text-xs">Título / Headline</Label>
                        <Input value={overlayHeadline} onChange={(e) => setOverlayHeadline(e.target.value)} placeholder="Ex: Promoção de Maio!" className="text-sm" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Subtítulo (opcional)</Label>
                        <Input value={overlayBody} onChange={(e) => setOverlayBody(e.target.value)} placeholder="Ex: Até 50% de desconto" className="text-sm" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Layout</Label>
                        <div className="grid grid-cols-2 gap-1.5">
                          {[
                            { value: "gradient-bottom", label: "Gradiente", desc: "Integrado à imagem" },
                            { value: "text-top", label: "Topo", desc: "Faixa no topo" },
                            { value: "text-center", label: "Centro", desc: "Overlay central" },
                            { value: "text-left", label: "Lateral", desc: "Texto à esquerda" },
                          ].map((t) => (
                            <button
                              key={t.value}
                              type="button"
                              onClick={() => setLayoutTemplate(t.value as typeof layoutTemplate)}
                              className={cn("p-2 rounded-lg border text-left transition-all", layoutTemplate === t.value ? "border-blue-600 bg-blue-50" : "border-gray-200 hover:border-gray-300")}
                            >
                              <p className="text-xs font-medium text-gray-900">{t.label}</p>
                              <p className="text-xs text-gray-400">{t.desc}</p>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <label className={cn("flex items-center gap-2 cursor-pointer select-none", !hasLogo && "opacity-50 cursor-not-allowed")}>
                  <input type="checkbox" checked={includeLogo && hasLogo} disabled={!hasLogo} onChange={(e) => setIncludeLogo(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-blue-600" />
                  <span className="text-sm text-gray-700">
                    Incluir logo nas imagens
                    {!hasLogo && <span className="text-gray-400 ml-1">(não configurada)</span>}
                  </span>
                </label>
              </CardContent>
            </Card>

            {/* Reference images */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Imagens de referência</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {refImages.map((img, i) => (
                    <div key={i} className="relative group">
                      <img src={img.url} alt={img.name} className="w-16 h-16 rounded-lg object-cover border border-gray-200" />
                      <button onClick={() => setRefImages((p) => p.filter((_, j) => j !== i))} className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  {refImages.length < 5 && (
                    <label className="w-16 h-16 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition">
                      <input type="file" accept="image/*" multiple onChange={handleUpload} className="hidden" disabled={uploading} />
                      {uploading ? <Loader2 className="h-4 w-4 animate-spin text-blue-500" /> : <Upload className="h-4 w-4 text-gray-400" />}
                      <span className="text-xs text-gray-400 mt-0.5">Upload</span>
                    </label>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-2">Até 5 imagens para contexto visual</p>
              </CardContent>
            </Card>

            {/* Generate buttons by format */}
            <div className="space-y-2">
              {format !== "story" && format !== "carousel" && (
                <Button onClick={generateText} disabled={loadingText} variant="default" className="w-full gap-2">
                  {loadingText ? <><Loader2 className="h-4 w-4 animate-spin" />Gerando textos...</> : <><Type className="h-4 w-4" />Gerar textos com IA</>}
                </Button>
              )}
              {format === "post" && (
                <Button onClick={generateImages} disabled={loadingImage} className="w-full gap-2 bg-purple-600 hover:bg-purple-700 text-white">
                  {loadingImage ? <><Loader2 className="h-4 w-4 animate-spin" />Gerando imagens...</> : <><ImageIcon className="h-4 w-4" />Gerar imagens com IA</>}
                </Button>
              )}
              {format === "reel" && (
                <>
                  <div className="space-y-1.5">
                    <Label>URL do vídeo</Label>
                    <Input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="https://..." />
                  </div>
                  <Button onClick={generateReelCaption} disabled={loadingCaption} className="w-full gap-2 bg-pink-600 hover:bg-pink-700 text-white">
                    {loadingCaption ? <><Loader2 className="h-4 w-4 animate-spin" />Gerando legenda...</> : <><Video className="h-4 w-4" />Gerar legenda para Reel</>}
                  </Button>
                  {(reelCaption || reelHashtags.length > 0) && (
                    <div className="border border-pink-200 bg-pink-50 rounded-xl p-3 space-y-2">
                      {reelCaption && <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{reelCaption}</p>}
                      {reelHashtags.length > 0 && <p className="text-sm text-pink-600">{reelHashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ")}</p>}
                    </div>
                  )}
                </>
              )}
              {format === "story" && (
                <>
                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-gray-400" />
                      Agendar Story (máx 24h)
                    </Label>
                    <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none" />
                  </div>
                  <div className="flex items-center gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 font-medium">
                    ⚠️ Stories são publicados por 24h apenas
                  </div>
                  <Button onClick={generateStory} disabled={loadingStory} className="w-full gap-2 bg-orange-500 hover:bg-orange-600 text-white">
                    {loadingStory ? <><Loader2 className="h-4 w-4 animate-spin" />Gerando Story...</> : <>📖 Gerar Story</>}
                  </Button>
                  {storyImage && (
                    <div className="mt-3">
                      <div className="relative mx-auto overflow-hidden rounded-xl border border-gray-200 shadow-sm" style={{ aspectRatio: "9/16", maxWidth: "180px" }}>
                        <Image src={storyImage} alt="Story preview" fill sizes="180px" className="object-cover" unoptimized />
                      </div>
                    </div>
                  )}
                </>
              )}
              {format === "carousel" && (
                <>
                  <div className="space-y-1.5">
                    <Label>Número de slides</Label>
                    <select
                      value={slideCount}
                      onChange={(e) => setSlideCount(Number(e.target.value))}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    >
                      {[3, 4, 5, 6, 7, 8, 9, 10].map((n) => (<option key={n} value={n}>{n} slides</option>))}
                    </select>
                  </div>
                  <Button onClick={generateCarousel} disabled={loadingCarousel} className="w-full gap-2 bg-indigo-600 hover:bg-indigo-700 text-white">
                    {loadingCarousel ? <><Loader2 className="h-4 w-4 animate-spin" />Gerando carrossel...</> : <>🎠 Gerar carrossel com IA</>}
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Right: Results */}
          <div className="lg:col-span-2 space-y-4">
            {aiError && (
              <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-100 rounded-xl text-sm text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                {aiError}
              </div>
            )}

            {loadingText && (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <div className="relative mb-4">
                    <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-100 border-t-blue-600" />
                    <Sparkles className="absolute inset-0 m-auto h-5 w-5 text-blue-600" />
                  </div>
                  <p className="text-gray-600 font-medium">Gerando 3 opções de texto...</p>
                </CardContent>
              </Card>
            )}

            {loadingImage && (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <div className="relative mb-4">
                    <div className="h-12 w-12 animate-spin rounded-full border-4 border-purple-100 border-t-purple-600" />
                    <ImageIcon className="absolute inset-0 m-auto h-5 w-5 text-purple-600" />
                  </div>
                  <p className="text-gray-600 font-medium">Gerando 3 imagens...</p>
                </CardContent>
              </Card>
            )}

            {loadingCarousel && (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <div className="relative mb-4">
                    <div className="h-12 w-12 animate-spin rounded-full border-4 border-indigo-100 border-t-indigo-600" />
                    <span className="absolute inset-0 m-auto flex items-center justify-center text-xl">🎠</span>
                  </div>
                  <p className="text-gray-600 font-medium">Gerando carrossel com IA...</p>
                </CardContent>
              </Card>
            )}

            {textOptions.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Type className="h-4 w-4 text-blue-600" />
                      Escolha o texto
                    </CardTitle>
                    {textCost && (
                      <Badge variant="secondary" className="text-xs">
                        {textCost.inputTokens + textCost.outputTokens} tokens · ${textCost.costUsd.toFixed(4)}
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {textOptions.map((opt, i) => (
                    <button
                      key={i}
                      onClick={() => setSelectedText(i)}
                      className={cn("w-full p-4 rounded-xl border-2 text-left transition-all", selectedText === i ? "border-blue-600 bg-blue-50" : "border-gray-200 hover:border-gray-300 hover:bg-gray-50")}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-semibold text-gray-900">Opção {i + 1}: {opt.title}</span>
                        {selectedText === i && <Badge variant="default" className="gap-1"><Check className="h-3 w-3" />Selecionado</Badge>}
                      </div>
                      <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">{opt.content}</p>
                    </button>
                  ))}
                </CardContent>
              </Card>
            )}

            {imageOptions.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <ImageIcon className="h-4 w-4 text-purple-600" />
                      Escolha a imagem
                    </CardTitle>
                    {imageCost && (
                      <Badge variant="purple" className="text-xs">
                        {imageCost.imagesGenerated} imagens · ${imageCost.costUsd.toFixed(4)}
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <VariationsPanel
                    images={imageOptions}
                    selectedIndex={selectedImage}
                    onSelect={setSelectedImage}
                    onLoadMore={generateImages}
                    loading={loadingImage}
                  />
                </CardContent>
              </Card>
            )}

            {format === "carousel" && carouselSlides.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">🎠 Carrossel gerado</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <CarouselEditor
                    slides={carouselSlides}
                    onReorder={(fromIndex, toIndex) => {
                      setCarouselSlides((prev) => {
                        const reordered = [...prev];
                        const [moved] = reordered.splice(fromIndex, 1);
                        if (moved) reordered.splice(toIndex, 0, moved);
                        return reordered.map((s, i) => ({ ...s, order: i }));
                      });
                    }}
                    loading={loadingCarousel}
                  />
                  <div className="flex gap-3 pt-2">
                    <Button variant="outline" onClick={() => router.push("/dashboard")}>Cancelar</Button>
                    <Button variant="gradient" className="flex-1" onClick={() => router.push("/posts")}>
                      <Save className="h-4 w-4" />
                      Salvar carrossel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {(selectedText !== null || selectedImage !== null) && (
              <>
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base text-gray-800">Preview</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="max-w-sm mx-auto border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
                      {selectedImage !== null && (
                        <div className="relative w-full aspect-square bg-gray-100">
                          <Image src={imageOptions[selectedImage]!} alt="Preview" fill sizes="400px" className="object-cover" unoptimized />
                        </div>
                      )}
                      {selectedText !== null && (
                        <div className="p-4">
                          <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{textOptions[selectedText]?.content}</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <ScheduleAndSave
                  scheduledAt={scheduledAt}
                  setScheduledAt={setScheduledAt}
                  saving={saving}
                  saveError={saveError}
                  platforms={platforms}
                  onCancel={() => router.push("/dashboard")}
                  onSave={() =>
                    savePosts(
                      selectedText !== null ? (textOptions[selectedText]?.content ?? null) : null,
                      selectedImage !== null ? (imageOptions[selectedImage] ?? null) : null,
                      {
                        textVariants: textOptions,
                        imageVariants: imageOptions,
                        selectedTextIndex: selectedText,
                        selectedImageIndex: selectedImage,
                      },
                    )
                  }
                />
              </>
            )}

            {!loadingText && !loadingImage && !loadingCarousel && textOptions.length === 0 && imageOptions.length === 0 && carouselSlides.length === 0 && (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-100 to-purple-100 mb-4">
                    <Sparkles className="h-8 w-8 text-blue-600" />
                  </div>
                  <p className="text-gray-600 font-medium mb-1">Pronto para criar conteúdo</p>
                  <p className="text-gray-400 text-sm">Configure as opções ao lado e clique em &quot;Gerar textos&quot; ou &quot;Gerar imagens&quot;</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
