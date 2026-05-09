"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Image from "next/image";

const TONES = [
  { value: "professional", label: "Profissional", description: "Linguagem corporativa e formal" },
  { value: "funny", label: "Engraçado", description: "Tom descontraído com humor" },
  { value: "informative", label: "Informativo", description: "Focado em educar o público" },
  { value: "inspirational", label: "Inspiracional", description: "Motiva e engaja emocionalmente" },
];

const SECTORS = [
  "Tecnologia",
  "Saúde",
  "Educação",
  "Alimentação",
  "Moda",
  "Finanças",
  "Imobiliário",
  "Automotivo",
  "Beleza",
  "Esportes",
  "Entretenimento",
  "Outro",
];

const MAX_LOGO_BYTES = 5 * 1024 * 1024;
const ALLOWED_LOGO_MIMES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

export default function OnboardingPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [companyName, setCompanyName] = useState("");
  const [description, setDescription] = useState("");
  const [sector, setSector] = useState("");
  const [objective, setObjective] = useState("");
  const [tone, setTone] = useState("professional");
  const [colors, setColors] = useState(["#3B82F6", "#1E40AF", "#FFFFFF"]);

  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Carrega dados existentes da empresa para edição
  useEffect(() => {
    if (!session) return;
    fetch("/api/company")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.id) return;
        if (data.name) setCompanyName(data.name);
        if (data.description) setDescription(data.description);
        if (data.sector) setSector(data.sector);
        if (data.objective) setObjective(data.objective);
        if (data.tone) setTone(data.tone);
        if (data.colors) {
          const parsed = typeof data.colors === "string"
            ? JSON.parse(data.colors)
            : data.colors;
          if (Array.isArray(parsed) && parsed.length > 0) setColors(parsed);
        }
        if (data.logoUrl) setLogoPreview(data.logoUrl);
      })
      .catch(() => {});
  }, [session]);

  function handleLogoChange(event: React.ChangeEvent<HTMLInputElement>) {
    setError("");
    const file = event.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_LOGO_MIMES.includes(file.type)) {
      setError("Formato não suportado. Use PNG, JPG, WebP ou SVG.");
      event.target.value = "";
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setError("Arquivo muito grande (máx 5MB).");
      event.target.value = "";
      return;
    }

    setLogoFile(file);
    const reader = new FileReader();
    reader.onload = () => setLogoPreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  function clearLogo() {
    setLogoFile(null);
    setLogoPreview(null);
    if (logoInputRef.current) logoInputRef.current.value = "";
  }

  async function handleFinish() {
    setLoading(true);
    setError("");

    const res = await fetch("/api/company", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: companyName,
        description,
        sector,
        objective,
        tone,
        colors,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Erro ao salvar empresa");
      setLoading(false);
      return;
    }

    if (logoFile) {
      const form = new FormData();
      form.append("file", logoFile);
      const upload = await fetch("/api/company/logo", { method: "POST", body: form });
      if (!upload.ok) {
        const data = await upload.json().catch(() => ({}));
        setError(
          `Empresa salva, mas logo falhou: ${data.error || "erro desconhecido"}. Você pode subir depois nas configurações.`,
        );
        setLoading(false);
        return;
      }
    }

    router.push("/dashboard");
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Configure sua empresa</h1>
          <p className="text-gray-500 mt-2">Passo {step} de 3 — você pode alterar a qualquer momento</p>
          <div className="mt-4 flex gap-2 justify-center">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={`h-2 w-16 rounded-full ${s <= step ? "bg-blue-600" : "bg-gray-200"}`}
              />
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          {step === 1 && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-gray-900">Sobre a empresa</h2>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nome da empresa
                </label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 bg-white placeholder-gray-400"
                  placeholder="Minha Empresa LTDA"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  O que a empresa faz?
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none text-gray-900 bg-white placeholder-gray-400"
                  rows={3}
                  placeholder="Descreva brevemente o que sua empresa faz, produtos/serviços oferecidos..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Setor/Ramo
                </label>
                <select
                  value={sector}
                  onChange={(e) => setSector(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 bg-white"
                >
                  <option value="">Selecione o setor</option>
                  {SECTORS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Objetivo principal com marketing digital
                </label>
                <input
                  type="text"
                  value={objective}
                  onChange={(e) => setObjective(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 bg-white placeholder-gray-400"
                  placeholder="Ex: Aumentar vendas, gerar leads, fortalecer marca..."
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-gray-900">Tom de comunicação</h2>
              <p className="text-gray-500 text-sm">Como você quer que seus posts soem?</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {TONES.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => setTone(t.value)}
                    className={`p-4 rounded-xl border-2 text-left transition ${
                      tone === t.value
                        ? "border-blue-600 bg-blue-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <p className="font-medium text-gray-900">{t.label}</p>
                    <p className="text-sm text-gray-500 mt-1">{t.description}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <h2 className="text-xl font-semibold text-gray-900">Identidade visual</h2>
              <p className="text-gray-500 text-sm">
                Defina as cores e envie seu logotipo. Você pode alterar depois.
              </p>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Paleta de cores
                </label>
                <div className="flex gap-4">
                  {colors.map((color, i) => (
                    <div key={i} className="flex flex-col items-center gap-2">
                      <input
                        type="color"
                        value={color}
                        onChange={(e) => {
                          const newColors = [...colors];
                          newColors[i] = e.target.value;
                          setColors(newColors);
                        }}
                        className="w-16 h-16 rounded-lg cursor-pointer border-2 border-gray-200"
                      />
                      <span className="text-xs text-gray-500">
                        {i === 0 ? "Principal" : i === 1 ? "Secundária" : "Fundo"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Logotipo (opcional)
                </label>
                <p className="text-xs text-gray-500 mb-2">
                  A IA vai adicionar seu logo discretamente no canto das imagens geradas.
                </p>

                {logoPreview ? (
                  <div className="border-2 border-gray-200 rounded-lg p-4 flex items-center gap-4 bg-gray-50">
                    <div className="relative w-20 h-20 bg-white rounded-lg border border-gray-200 overflow-hidden flex-shrink-0">
                      <Image
                        src={logoPreview}
                        alt="Logo preview"
                        fill
                        sizes="80px"
                        className="object-contain"
                        unoptimized
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {logoFile?.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {logoFile ? (logoFile.size / 1024).toFixed(0) : 0} KB
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={clearLogo}
                      className="text-sm text-red-600 hover:text-red-700 font-medium"
                    >
                      Remover
                    </button>
                  </div>
                ) : (
                  <label className="block border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-400 transition cursor-pointer">
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept={ALLOWED_LOGO_MIMES.join(",")}
                      onChange={handleLogoChange}
                      className="hidden"
                    />
                    <p className="text-gray-500">Clique para fazer upload</p>
                    <p className="text-xs text-gray-400 mt-1">PNG, JPG, WebP ou SVG até 5MB</p>
                  </label>
                )}
              </div>

              <div className="mt-4 p-4 rounded-xl bg-gray-50 border border-gray-200">
                <p className="text-sm font-medium text-gray-700 mb-2">Preview</p>
                <div className="flex gap-2">
                  {colors.map((color, i) => (
                    <div
                      key={i}
                      className="w-12 h-12 rounded-lg border border-gray-200"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-6 bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <div className="flex justify-between mt-8">
            {step > 1 ? (
              <button
                onClick={() => setStep(step - 1)}
                className="px-6 py-3 text-gray-600 hover:text-gray-900 font-medium transition"
              >
                Voltar
              </button>
            ) : (
              <div />
            )}

            {step < 3 ? (
              <button
                onClick={() => setStep(step + 1)}
                disabled={step === 1 && !companyName}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50"
              >
                Próximo
              </button>
            ) : (
              <button
                onClick={handleFinish}
                disabled={loading}
                className="px-6 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition disabled:opacity-50"
              >
                {loading ? "Salvando..." : "Finalizar"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
