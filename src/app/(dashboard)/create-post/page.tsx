"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

interface TextOption {
  title: string;
  content: string;
}

type SaveState = { loading: boolean; error: string };

export default function CreatePostPage() {
  const { data: session } = useSession();
  const router = useRouter();

  const [platform, setPlatform] = useState("instagram");
  const [idea, setIdea] = useState("");
  const [additionalContext, setAdditionalContext] = useState("");
  const [style, setStyle] = useState("");

  const [textOptions, setTextOptions] = useState<TextOption[]>([]);
  const [imageOptions, setImageOptions] = useState<string[]>([]);
  const [selectedText, setSelectedText] = useState<number | null>(null);
  const [selectedImage, setSelectedImage] = useState<number | null>(null);
  const [scheduledAt, setScheduledAt] = useState("");

  const [hasCompanyLogo, setHasCompanyLogo] = useState(false);
  const [includeLogo, setIncludeLogo] = useState(true);

  const [loadingText, setLoadingText] = useState(false);
  const [loadingImage, setLoadingImage] = useState(false);
  const [save, setSave] = useState<SaveState>({ loading: false, error: "" });
  const [error, setError] = useState("");

  const [textCost, setTextCost] = useState<{ inputTokens: number; outputTokens: number; costUsd: number } | null>(null);
  const [imageCost, setImageCost] = useState<{ imagesGenerated: number; costUsd: number } | null>(null);

  // Upload de imagens de referência
  const [referenceImages, setReferenceImages] = useState<{ url: string; name: string }[]>([]);
  const [uploading, setUploading] = useState(false);

  // Trending topics
  interface TrendItem { title: string; source: string }
  const [trends, setTrends] = useState<TrendItem[]>([]);
  const [loadingTrends, setLoadingTrends] = useState(false);
  const [trendingContext, setTrendingContext] = useState("");
  const [showTrends, setShowTrends] = useState(false);

  // Descobre se a empresa tem logo para habilitar o toggle.
  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    fetch("/api/company")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        const hasLogo = Boolean(data?.logoUrl);
        setHasCompanyLogo(hasLogo);
        setIncludeLogo(hasLogo);
      })
      .catch(() => {
        /* silencioso: toggle apenas fica desabilitado */
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    setError("");

    const formData = new FormData();
    Array.from(files).forEach((file) => formData.append("files", file));

    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro no upload");
      setReferenceImages((prev) => [...prev, ...data.files]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro no upload");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  function removeReferenceImage(index: number) {
    setReferenceImages((prev) => prev.filter((_, i) => i !== index));
  }

  async function fetchTrends() {
    setLoadingTrends(true);
    try {
      const res = await fetch("/api/trends");
      const data = await res.json();
      if (res.ok) {
        const all = [...(data.trends || []), ...(data.news || []), ...(data.tech || [])];
        setTrends(all);
        setShowTrends(true);
      }
    } catch {
      setError("Erro ao buscar trending topics");
    } finally {
      setLoadingTrends(false);
    }
  }

  function selectTrend(trend: TrendItem) {
    setAdditionalContext((prev) =>
      prev ? `${prev}\n- ${trend.title} (${trend.source})` : `- ${trend.title} (${trend.source})`
    );
    setTrendingContext((prev) =>
      prev ? `${prev}\n- ${trend.title} (${trend.source})` : `- ${trend.title} (${trend.source})`
    );
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
        body: JSON.stringify({
          platform,
          idea,
          topic: additionalContext,
          trendingContext: trendingContext || additionalContext,
          referenceImages: referenceImages.map((img) => img.url),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao gerar texto");
      setTextOptions(data.options as TextOption[]);
      if (data.usage) setTextCost(data.usage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao gerar texto");
    } finally {
      setLoadingText(false);
    }
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
        body: JSON.stringify({
          platform,
          idea,
          style,
          includeLogo,
          referenceContext: referenceImages.length > 0
            ? `User uploaded ${referenceImages.length} reference images showing desired visual style`
            : "",
          trendingContext: trendingContext || additionalContext || "",
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao gerar imagens");
      setImageOptions(data.images as string[]);
      if (data.usage) setImageCost(data.usage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao gerar imagens");
    } finally {
      setLoadingImage(false);
    }
  }

  async function savePost() {
    setSave({ loading: true, error: "" });

    if (selectedText === null && selectedImage === null) {
      setSave({ loading: false, error: "Selecione ao menos um texto ou imagem" });
      return;
    }

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
      if (!res.ok) throw new Error(data.error || "Erro ao salvar post");
      router.push("/dashboard");
    } catch (err) {
      setSave({
        loading: false,
        error: err instanceof Error ? err.message : "Erro ao salvar",
      });
    }
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Carregando...</p>
      </div>
    );
  }

  const canSave = selectedText !== null || selectedImage !== null;

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <Link href="/dashboard" className="text-xl font-bold text-blue-600">
              MKT Digital
            </Link>
            <span className="text-sm text-gray-600">{session.user?.name}</span>
          </div>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900">Criar novo post</h2>
          <p className="text-gray-500 mt-1">
            A IA vai gerar 3 opções de texto e imagem para você escolher.
          </p>
        </div>

        {/* Configuração */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Configuração</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Plataforma
              </label>
              <div className="flex flex-wrap gap-2">
                {["instagram", "facebook", "linkedin", "whatsapp"].map((p) => (
                  <button
                    key={p}
                    onClick={() => setPlatform(p)}
                    className={`px-4 py-2 rounded-lg border font-medium text-sm capitalize transition ${
                      platform === p
                        ? "border-blue-600 bg-blue-50 text-blue-700"
                        : "border-gray-200 text-gray-600 hover:border-gray-300"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Estilo da imagem (opcional)
              </label>
              <input
                type="text"
                value={style}
                onChange={(e) => setStyle(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 bg-white placeholder-gray-400"
                placeholder="Ex: minimalista, colorido, corporativo..."
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Ideia para o post (opcional)
              </label>
              <textarea
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none text-gray-900 bg-white placeholder-gray-400"
                rows={3}
                placeholder="Descreva a ideia do post ou deixe em branco para sugestões automáticas..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Contexto adicional
              </label>
              <div className="relative">
                <textarea
                  value={additionalContext}
                  onChange={(e) => {
                    setAdditionalContext(e.target.value);
                    setTrendingContext(e.target.value);
                  }}
                  className="w-full px-4 py-2 pr-24 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none text-gray-900 bg-white placeholder-gray-400"
                  rows={3}
                  placeholder="Descreva o contexto, tema ou assunto do momento. Clique 'Buscar' para ver o que está em alta..."
                />
                <button
                  type="button"
                  onClick={fetchTrends}
                  disabled={loadingTrends}
                  className="absolute top-2 right-2 px-3 py-1 bg-orange-500 text-white text-xs rounded-md font-medium hover:bg-orange-600 transition disabled:opacity-50"
                >
                  {loadingTrends ? "..." : "Buscar"}
                </button>
              </div>
              {trendingContext && (
                <p className="text-xs text-green-600 mt-1">
                  Contexto carregado ({trendingContext.split("\n").length} linha(s))
                </p>
              )}
            </div>
          </div>

          {/* Trending Topics Dropdown */}
          {showTrends && trends.length > 0 && (
            <div className="mt-4 p-4 bg-orange-50 rounded-xl border border-orange-200 max-h-60 overflow-y-auto">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold text-orange-800">Assuntos em alta agora</h4>
                <button
                  onClick={() => setShowTrends(false)}
                  className="text-xs text-orange-600 hover:underline"
                >
                  Fechar
                </button>
              </div>
              <div className="space-y-1">
                {trends.map((trend, i) => (
                  <button
                    key={i}
                    onClick={() => selectTrend(trend)}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-orange-100 transition text-sm"
                  >
                    <span className="text-gray-800">{trend.title}</span>
                    <span className="text-xs text-orange-500 ml-2">({trend.source})</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Upload de Imagens de Referência */}
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Imagens de referência (opcional)
            </label>
            <p className="text-xs text-gray-500 mb-2">
              Envie imagens para dar contexto visual do que você deseja. Até 5 imagens, max 10MB cada.
            </p>
            <div className="flex flex-wrap gap-3 items-start">
              {referenceImages.map((img, i) => (
                <div key={i} className="relative group">
                  <img
                    src={img.url}
                    alt={img.name}
                    className="w-20 h-20 rounded-lg object-cover border border-gray-200"
                  />
                  <button
                    onClick={() => removeReferenceImage(i)}
                    className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                  >
                    x
                  </button>
                  <p className="text-xs text-gray-400 mt-0.5 truncate w-20">{img.name}</p>
                </div>
              ))}
              {referenceImages.length < 5 && (
                <label className="w-20 h-20 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 transition">
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleUpload}
                    className="hidden"
                    disabled={uploading}
                  />
                  {uploading ? (
                    <div className="animate-spin w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full" />
                  ) : (
                    <>
                      <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      <span className="text-xs text-gray-400 mt-1">Upload</span>
                    </>
                  )}
                </label>
              )}
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <label
              className={`flex items-center gap-2 select-none ${
                hasCompanyLogo ? "cursor-pointer text-gray-700" : "cursor-not-allowed text-gray-400"
              }`}
              title={
                hasCompanyLogo
                  ? "Adiciona a logo da empresa no canto da imagem"
                  : "Envie uma logo nas configurações da empresa para habilitar"
              }
            >
              <input
                type="checkbox"
                checked={includeLogo && hasCompanyLogo}
                disabled={!hasCompanyLogo}
                onChange={(e) => setIncludeLogo(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm font-medium">
                Incluir logo da empresa nas imagens
                {!hasCompanyLogo && " (logo não configurada)"}
              </span>
            </label>
          </div>

          <div className="flex gap-3 mt-6">
            <button
              onClick={generateText}
              disabled={loadingText}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50"
            >
              {loadingText ? "Gerando textos..." : "Gerar textos"}
            </button>
            <button
              onClick={generateImages}
              disabled={loadingImage}
              className="px-6 py-3 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition disabled:opacity-50"
            >
              {loadingImage ? "Gerando imagens..." : "Gerar imagens"}
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
            <p className="text-red-700">{error}</p>
          </div>
        )}

        {/* Opções de Texto */}
        {textOptions.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Escolha o texto
              </h3>
              {textCost && (
                <span className="text-xs px-2 py-1 rounded-full bg-blue-50 text-blue-700 font-medium">
                  {textCost.inputTokens + textCost.outputTokens} tokens | ${textCost.costUsd.toFixed(4)}
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 gap-4">
              {textOptions.map((option, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedText(i)}
                  className={`p-4 rounded-xl border-2 text-left transition ${
                    selectedText === i
                      ? "border-blue-600 bg-blue-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <p className="font-medium text-gray-900 mb-2">
                    Opção {i + 1}: {option.title}
                  </p>
                  <p className="text-gray-600 text-sm whitespace-pre-wrap">
                    {option.content}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Opções de Imagem */}
        {imageOptions.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Escolha a imagem
              </h3>
              {imageCost && (
                <span className="text-xs px-2 py-1 rounded-full bg-purple-50 text-purple-700 font-medium">
                  {imageCost.imagesGenerated} imagens | ${imageCost.costUsd.toFixed(4)}
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {imageOptions.map((url, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedImage(i)}
                  className={`rounded-xl border-2 overflow-hidden transition ${
                    selectedImage === i
                      ? "border-blue-600 ring-2 ring-blue-200"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <div className="relative w-full h-64 bg-gray-100">
                    <Image
                      src={url}
                      alt={`Opção ${i + 1}`}
                      fill
                      sizes="(max-width: 768px) 100vw, 33vw"
                      className="object-cover"
                      unoptimized
                    />
                  </div>
                  <div className="p-2 text-center">
                    <span className="text-sm font-medium text-gray-700">
                      Opção {i + 1}
                    </span>
                  </div>
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-3">
              {includeLogo && hasCompanyLogo
                ? "Imagens com logo embutida (data URL): não expiram, mas ocupam mais espaço no banco."
                : "As imagens ficam hospedadas no Replicate e expiram em cerca de 1h. Salve o post para preservá-las (em breve: upload para storage permanente)."}
            </p>
          </div>
        )}

        {/* Preview e Salvar */}
        {canSave && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Preview</h3>

            <div className="max-w-md mx-auto border border-gray-200 rounded-xl overflow-hidden">
              {selectedImage !== null && (
                <div className="relative w-full h-64 bg-gray-100">
                  <Image
                    src={imageOptions[selectedImage]}
                    alt="Preview"
                    fill
                    sizes="(max-width: 768px) 100vw, 500px"
                    className="object-cover"
                    unoptimized
                  />
                </div>
              )}
              {selectedText !== null && (
                <div className="p-4">
                  <p className="text-sm text-gray-800 whitespace-pre-wrap">
                    {textOptions[selectedText].content}
                  </p>
                </div>
              )}
            </div>

            <div className="mt-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Agendar publicação (opcional)
              </label>
              <input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 bg-white"
              />
              <p className="text-xs text-gray-500 mt-1">
                Sem data: post fica como rascunho. Com data: fica agendado.
              </p>
            </div>

            {save.error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mt-4">
                <p className="text-red-700 text-sm">{save.error}</p>
              </div>
            )}

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => router.push("/dashboard")}
                disabled={save.loading}
                className="px-6 py-3 text-gray-600 hover:text-gray-900 font-medium disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={savePost}
                disabled={save.loading}
                className="px-6 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition disabled:opacity-50"
              >
                {save.loading ? "Salvando..." : scheduledAt ? "Agendar post" : "Salvar post"}
              </button>
            </div>
          </div>
        )}

        {/* Loading states */}
        {loadingText && (
          <div className="bg-white rounded-xl border border-gray-200 p-8 mb-6 text-center">
            <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto" />
            <p className="text-gray-500 mt-4">Gerando 3 opções de texto com IA...</p>
          </div>
        )}

        {loadingImage && (
          <div className="bg-white rounded-xl border border-gray-200 p-8 mb-6 text-center">
            <div className="animate-spin w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full mx-auto" />
            <p className="text-gray-500 mt-4">Gerando 3 opções de imagem com IA...</p>
            <p className="text-gray-400 text-sm mt-1">As 3 variações rodam em paralelo (~5-20s).</p>
          </div>
        )}
      </main>
    </div>
  );
}
