"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  Sparkles, Loader2, TrendingUp, Upload, X, Check,
  Share2, Type, ImageIcon, Save, Calendar, AlertCircle,
} from "lucide-react";
import { DashboardLayout } from "@client/components/layout/dashboard-layout";
import { Button } from "@client/components/ui/button";
import { Badge } from "@client/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@client/components/ui/card";
import { Input } from "@client/components/ui/input";
import { Label } from "@client/components/ui/label";
import { cn } from "@server/lib/utils";

interface TextOption { title: string; content: string; }
interface TrendItem { title: string; source: string; }

const PLATFORMS = [
  { id: "instagram", label: "Instagram", icon: Share2, color: "text-pink-500" },
  { id: "facebook", label: "Facebook", icon: Share2, color: "text-blue-600" },
  { id: "linkedin", label: "LinkedIn", icon: Share2, color: "text-blue-700" },
  { id: "whatsapp", label: "WhatsApp", icon: Share2, color: "text-green-500" },
];

export default function CreatePostPage() {
  const { data: session } = useSession();
  const router = useRouter();

  const [platform, setPlatform] = useState("instagram");
  const [idea, setIdea] = useState("");
  const [additionalContext, setAdditionalContext] = useState("");
  const [trendingContext, setTrendingContext] = useState("");
  const [style, setStyle] = useState("");
  const [hasLogo, setHasLogo] = useState(false);
  const [includeLogo, setIncludeLogo] = useState(true);

  // Text overlay
  const [addTextOverlay, setAddTextOverlay] = useState(false);
  const [overlayHeadline, setOverlayHeadline] = useState("");
  const [overlayBody, setOverlayBody] = useState("");
  const [overlayPosition, setOverlayPosition] = useState<"bottom" | "top" | "center">("bottom");
  const [layoutTemplate, setLayoutTemplate] = useState<"gradient-bottom" | "text-top" | "text-center" | "text-left">("gradient-bottom");

  const [textOptions, setTextOptions] = useState<TextOption[]>([]);
  const [imageOptions, setImageOptions] = useState<string[]>([]);
  const [selectedText, setSelectedText] = useState<number | null>(null);
  const [selectedImage, setSelectedImage] = useState<number | null>(null);
  const [scheduledAt, setScheduledAt] = useState("");

  const [loadingText, setLoadingText] = useState(false);
  const [loadingImage, setLoadingImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");

  const [textCost, setTextCost] = useState<{ inputTokens: number; outputTokens: number; costUsd: number } | null>(null);
  const [imageCost, setImageCost] = useState<{ imagesGenerated: number; costUsd: number } | null>(null);

  const [refImages, setRefImages] = useState<{ url: string; name: string }[]>([]);
  const [uploading, setUploading] = useState(false);

  const [trends, setTrends] = useState<TrendItem[]>([]);
  const [loadingTrends, setLoadingTrends] = useState(false);
  const [showTrends, setShowTrends] = useState(false);

  useEffect(() => {
    if (!session) return;
    fetch("/api/company").then((r) => r.ok ? r.json() : null).then((d) => {
      const logo = Boolean(d?.logoUrl);
      setHasLogo(logo);
      setIncludeLogo(logo);
    }).catch(() => {});
  }, [session]);

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
      setError(err instanceof Error ? err.message : "Erro no upload");
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
    } catch { setError("Erro ao buscar trending topics"); }
    finally { setLoadingTrends(false); }
  }

  function selectTrend(t: TrendItem) {
    const line = `- ${t.title} (${t.source})`;
    setAdditionalContext((p) => p ? `${p}\n${line}` : line);
    setTrendingContext((p) => p ? `${p}\n${line}` : line);
    setShowTrends(false);
  }

  async function generateText() {
    setLoadingText(true);
    setError("");
    setTextOptions([]);
    setSelectedText(null);
    try {
      const res = await fetch("/api/generate/text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, idea, topic: additionalContext, trendingContext: trendingContext || additionalContext, referenceImages: refImages.map((i) => i.url) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTextOptions(data.options);
      if (data.usage) setTextCost(data.usage);
    } catch (err) { setError(err instanceof Error ? err.message : "Erro ao gerar texto"); }
    finally { setLoadingText(false); }
  }

  async function generateImages() {
    setLoadingImage(true);
    setError("");
    setImageOptions([]);
    setSelectedImage(null);
    try {
      const res = await fetch("/api/generate/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, idea, style, includeLogo, referenceContext: refImages.length > 0 ? `${refImages.length} reference images` : "", trendingContext: trendingContext || additionalContext, addTextOverlay, overlayHeadline: addTextOverlay ? overlayHeadline : "", overlayBody: addTextOverlay ? overlayBody : "", overlayPosition, layoutTemplate }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setImageOptions(data.images);
      if (data.usage) setImageCost(data.usage);
    } catch (err) { setError(err instanceof Error ? err.message : "Erro ao gerar imagens"); }
    finally { setLoadingImage(false); }
  }

  async function savePost() {
    if (selectedText === null && selectedImage === null) { setSaveError("Selecione ao menos um texto ou imagem"); return; }
    setSaving(true);
    setSaveError("");
    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform,
          content: selectedText !== null ? textOptions[selectedText].content : null,
          imageUrl: selectedImage !== null ? imageOptions[selectedImage] : null,
          scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
          textVariants: textOptions,
          imageVariants: imageOptions,
          selectedTextIndex: selectedText,
          selectedImageIndex: selectedImage,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      router.push("/posts");
    } catch (err) { setSaveError(err instanceof Error ? err.message : "Erro ao salvar"); }
    finally { setSaving(false); }
  }

  if (!session) return null;

  const canSave = selectedText !== null || selectedImage !== null;

  return (
    <DashboardLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Criar novo post</h1>
        <p className="text-gray-500 mt-1">A IA gera 3 opções de texto e imagem para você escolher</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Config */}
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Plataforma</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2">
              {PLATFORMS.map((p) => {
                const Icon = p.icon;
                return (
                  <button
                    key={p.id}
                    onClick={() => setPlatform(p.id)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all",
                      platform === p.id ? "border-blue-600 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                    )}
                  >
                    <Icon className={cn("h-4 w-4", platform === p.id ? "text-blue-600" : p.color)} />
                    {p.label}
                  </button>
                );
              })}
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

              {/* Trending dropdown */}
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

              {/* Text overlay */}
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
                      <Input
                        value={overlayHeadline}
                        onChange={(e) => setOverlayHeadline(e.target.value)}
                        placeholder="Ex: Promoção de Maio!"
                        className="text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Subtítulo (opcional)</Label>
                      <Input
                        value={overlayBody}
                        onChange={(e) => setOverlayBody(e.target.value)}
                        placeholder="Ex: Até 50% de desconto"
                        className="text-sm"
                      />
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
                            className={cn(
                              "p-2 rounded-lg border text-left transition-all",
                              layoutTemplate === t.value
                                ? "border-blue-600 bg-blue-50"
                                : "border-gray-200 hover:border-gray-300"
                            )}
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

              {/* Logo toggle */}
              <label className={cn("flex items-center gap-2 cursor-pointer select-none", !hasLogo && "opacity-50 cursor-not-allowed")}>
                <input
                  type="checkbox"
                  checked={includeLogo && hasLogo}
                  disabled={!hasLogo}
                  onChange={(e) => setIncludeLogo(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600"
                />
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
                    <button
                      onClick={() => setRefImages((p) => p.filter((_, j) => j !== i))}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                    >
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

          {/* Generate buttons */}
          <div className="space-y-2">
            <Button onClick={generateText} disabled={loadingText} variant="default" className="w-full gap-2">
              {loadingText ? <><Loader2 className="h-4 w-4 animate-spin" />Gerando textos...</> : <><Type className="h-4 w-4" />Gerar textos com IA</>}
            </Button>
            <Button onClick={generateImages} disabled={loadingImage} className="w-full gap-2 bg-purple-600 hover:bg-purple-700 text-white">
              {loadingImage ? <><Loader2 className="h-4 w-4 animate-spin" />Gerando imagens...</> : <><ImageIcon className="h-4 w-4" />Gerar imagens com IA</>}
            </Button>
          </div>
        </div>

        {/* Right: Results */}
        <div className="lg:col-span-2 space-y-4">
          {error && (
            <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-100 rounded-xl text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          {/* Loading states */}
          {loadingText && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <div className="relative mb-4">
                  <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-100 border-t-blue-600" />
                  <Sparkles className="absolute inset-0 m-auto h-5 w-5 text-blue-600" />
                </div>
                <p className="text-gray-600 font-medium">Gerando 3 opções de texto...</p>
                <p className="text-gray-400 text-sm mt-1">Claude está criando conteúdo personalizado</p>
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
                <p className="text-gray-400 text-sm mt-1">Cada variação é gerada em sequência (~30-45s no total)</p>
              </CardContent>
            </Card>
          )}

          {/* Text options */}
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
                    className={cn(
                      "w-full p-4 rounded-xl border-2 text-left transition-all",
                      selectedText === i ? "border-blue-600 bg-blue-50" : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                    )}
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

          {/* Image options */}
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
                <div className="grid grid-cols-3 gap-3">
                  {imageOptions.map((url, i) => (
                    <button
                      key={i}
                      onClick={() => setSelectedImage(i)}
                      className={cn(
                        "relative rounded-xl overflow-hidden border-2 transition-all",
                        selectedImage === i ? "border-blue-600 ring-2 ring-blue-200" : "border-gray-200 hover:border-gray-300"
                      )}
                    >
                      <div className="relative w-full aspect-square bg-gray-100">
                        <Image src={url} alt={`Opção ${i + 1}`} fill sizes="200px" className="object-cover" unoptimized />
                        {selectedImage === i && (
                          <div className="absolute inset-0 bg-blue-600/20 flex items-center justify-center">
                            <div className="bg-blue-600 rounded-full p-1">
                              <Check className="h-4 w-4 text-white" />
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="p-2 text-center">
                        <span className="text-xs font-medium text-gray-600">Opção {i + 1}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Preview + Save */}
          {canSave && (
            <Card className="border-green-200 bg-green-50/30">
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-green-800">Preview e salvar</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Preview */}
                <div className="max-w-sm mx-auto border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
                  {selectedImage !== null && (
                    <div className="relative w-full aspect-square bg-gray-100">
                      <Image src={imageOptions[selectedImage]} alt="Preview" fill sizes="400px" className="object-cover" unoptimized />
                    </div>
                  )}
                  {selectedText !== null && (
                    <div className="p-4">
                      <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{textOptions[selectedText].content}</p>
                    </div>
                  )}
                </div>

                {/* Schedule */}
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
                  <p className="text-xs text-gray-400">Sem data: salva como rascunho. Com data: agenda automaticamente.</p>
                </div>

                {saveError && (
                  <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-600">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {saveError}
                  </div>
                )}

                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => router.push("/dashboard")} disabled={saving}>Cancelar</Button>
                  <Button variant="gradient" onClick={savePost} disabled={saving} className="flex-1">
                    {saving ? <><Loader2 className="h-4 w-4 animate-spin" />Salvando...</> :
                     scheduledAt ? <><Calendar className="h-4 w-4" />Agendar post</> :
                     <><Save className="h-4 w-4" />Salvar post</>}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Empty state */}
          {!loadingText && !loadingImage && textOptions.length === 0 && imageOptions.length === 0 && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-100 to-purple-100 mb-4">
                  <Sparkles className="h-8 w-8 text-blue-600" />
                </div>
                <p className="text-gray-600 font-medium mb-1">Pronto para criar conteúdo</p>
                <p className="text-gray-400 text-sm">Configure as opções ao lado e clique em "Gerar textos" ou "Gerar imagens"</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
