"use client";

import { Suspense, useContext, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Image from "next/image";
import {
  Sparkles,
  Loader2,
  Upload,
  X,
  Check,
  Building2,
  MessageSquare,
  Palette,
} from "lucide-react";
import { Button } from "@client/components/ui/button";
import { Input } from "@client/components/ui/input";
import { Label } from "@client/components/ui/label";
import { Card, CardContent } from "@client/components/ui/card";
import { cn } from "@server/lib/utils";
import { CompanyContext } from "@client/components/company/CompanyContext";

const TONES = [
  { value: "professional", label: "Profissional", description: "Linguagem corporativa e formal", emoji: "💼" },
  { value: "funny", label: "Engraçado", description: "Tom descontraído com humor", emoji: "😄" },
  { value: "informative", label: "Informativo", description: "Focado em educar o público", emoji: "📚" },
  { value: "inspirational", label: "Inspiracional", description: "Motiva e engaja emocionalmente", emoji: "✨" },
];

const SECTORS = [
  "Tecnologia", "Saúde", "Educação", "Alimentação", "Moda",
  "Finanças", "Imobiliário", "Automotivo", "Beleza", "Esportes",
  "Entretenimento", "Outro",
];

const STEPS = [
  { label: "Empresa", icon: Building2 },
  { label: "Tom de voz", icon: MessageSquare },
  { label: "Visual", icon: Palette },
];

// ─────────────────────────────────────────────
// Inner component that reads search params
// (must be wrapped in <Suspense> because of useSearchParams)
// ─────────────────────────────────────────────

function OnboardingForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isCreateMode = searchParams.get("mode") === "create";

  const { data: session, update: updateSession } = useSession();
  // Use context directly (not the throwing hook) — onboarding may render
  // outside DashboardLayout (no CompanyProvider) when adding a new client.
  const companyCtx = useContext(CompanyContext);
  const activeCompany = companyCtx?.company ?? null;
  const refresh = companyCtx?.refresh ?? (async () => {});

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const [companyName, setCompanyName] = useState("");
  const [description, setDescription] = useState("");
  const [sector, setSector] = useState("");
  const [objective, setObjective] = useState("");
  const [tone, setTone] = useState("professional");
  const [colors, setColors] = useState(["#3B82F6", "#1E40AF", "#FFFFFF"]);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const logoRef = useRef<HTMLInputElement>(null);

  // Pre-fill form in edit mode when active company data becomes available
  useEffect(() => {
    if (isCreateMode) return; // Create mode: keep form empty
    if (!activeCompany) return;

    if (activeCompany.name) setCompanyName(activeCompany.name);
    if (activeCompany.description) setDescription(activeCompany.description);
    if (activeCompany.sector) setSector(activeCompany.sector);
    if (activeCompany.objective) setObjective(activeCompany.objective);
    if (activeCompany.tone) setTone(activeCompany.tone);
    if (activeCompany.colors && activeCompany.colors.length > 0) {
      setColors(activeCompany.colors);
    }
    if (activeCompany.logoUrl) setLogoPreview(activeCompany.logoUrl);
  }, [activeCompany, isCreateMode]);

  function handleLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp", "image/svg+xml"].includes(file.type)) {
      setError("Formato não suportado. Use PNG, JPG, WebP ou SVG.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Arquivo muito grande (máx 5MB).");
      return;
    }
    setLogoFile(file);
    const reader = new FileReader();
    reader.onload = () => setLogoPreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function uploadLogo(): Promise<void> {
    if (!logoFile) return;
    const form = new FormData();
    form.append("file", logoFile);
    await fetch("/api/company/logo", { method: "POST", body: form });
  }

  async function handleCreate() {
    setLoading(true);
    setError("");
    setSuccessMessage("");

    // 1. Create the company
    const createRes = await fetch("/api/companies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: companyName, description, sector, objective, tone, colors }),
    });

    if (!createRes.ok) {
      const d = await createRes.json().catch(() => ({})) as Record<string, unknown>;
      setError(typeof d["error"] === "string" ? d["error"] : "Erro ao criar empresa");
      setLoading(false);
      return;
    }

    const newCompany = await createRes.json() as { id: string };

    // 2. Upload logo if provided (after session is updated with the new company)
    // Note: logo upload uses the active company from session; logo will be uploaded
    // after the session is updated in step 4
    const shouldUploadLogo = !!logoFile;

    // 3. Select the new company as active
    const selectRes = await fetch("/api/companies/select", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId: newCompany.id }),
    });

    if (!selectRes.ok) {
      setError("Empresa criada, mas não foi possível selecioná-la. Acesse o seletor de empresa.");
      setLoading(false);
      return;
    }

    // 4. Update the session with the new activeCompanyId
    await updateSession({ activeCompanyId: newCompany.id });

    // 5. Upload logo now that the session has the new activeCompanyId
    if (shouldUploadLogo) {
      await uploadLogo();
    }

    router.push("/dashboard");
  }

  async function handleEdit() {
    if (!activeCompany) return;
    setLoading(true);
    setError("");
    setSuccessMessage("");

    const res = await fetch(`/api/companies/${activeCompany.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: companyName, description, sector, objective, tone, colors }),
    });

    if (!res.ok) {
      const d = await res.json().catch(() => ({})) as Record<string, unknown>;
      setError(typeof d["error"] === "string" ? d["error"] : "Erro ao salvar empresa");
      setLoading(false);
      return;
    }

    // Upload logo if a new file was selected
    if (logoFile) {
      await uploadLogo();
    }

    // Refresh company context so other components reflect the update
    await refresh();

    setSuccessMessage("Configurações salvas com sucesso!");
    setLoading(false);
  }

  async function handleFinish() {
    if (isCreateMode) {
      await handleCreate();
    } else {
      await handleEdit();
    }
  }

  const pageTitle = isCreateMode ? "Nova Empresa" : "Configurações da Empresa";
  const pageSubtitle = isCreateMode
    ? "Preencha os dados para criar uma nova empresa"
    : "Você pode alterar essas informações a qualquer momento";

  if (!session) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 shadow-lg shadow-blue-200">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold text-gray-900">MKT Digital</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{pageTitle}</h1>
          <p className="text-gray-500 mt-1 text-sm">{pageSubtitle}</p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-0 mb-8">
          {STEPS.map((s, i) => {
            const num = i + 1;
            const Icon = s.icon;
            const isActive = step === num;
            const isDone = step > num;
            return (
              <div key={s.label} className="flex items-center">
                <div className="flex flex-col items-center">
                  <div
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-full border-2 transition-all",
                      isDone
                        ? "bg-blue-600 border-blue-600 text-white"
                        : isActive
                        ? "border-blue-600 bg-blue-50 text-blue-600"
                        : "border-gray-200 bg-white text-gray-400"
                    )}
                  >
                    {isDone ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                  </div>
                  <span
                    className={cn(
                      "text-xs mt-1 font-medium",
                      isActive ? "text-blue-600" : isDone ? "text-gray-600" : "text-gray-400"
                    )}
                  >
                    {s.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    className={cn(
                      "h-0.5 w-16 mx-2 mb-4 transition-all",
                      step > num ? "bg-blue-600" : "bg-gray-200"
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>

        <Card className="shadow-xl border-0">
          <CardContent className="p-8">
            {/* Step 1 — Company info */}
            {step === 1 && (
              <div className="space-y-5">
                <h2 className="text-lg font-semibold text-gray-900">Sobre a empresa</h2>
                <div className="space-y-1.5">
                  <Label>Nome da empresa *</Label>
                  <Input
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Minha Empresa LTDA"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>O que a empresa faz?</Label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none"
                    rows={3}
                    placeholder="Descreva brevemente seus produtos/serviços..."
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Setor</Label>
                    <select
                      value={sector}
                      onChange={(e) => setSector(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    >
                      <option value="">Selecione...</option>
                      {SECTORS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Objetivo de marketing</Label>
                    <Input
                      value={objective}
                      onChange={(e) => setObjective(e.target.value)}
                      placeholder="Ex: Gerar leads"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Step 2 — Tone */}
            {step === 2 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Tom de comunicação</h2>
                  <p className="text-sm text-gray-500 mt-1">Como você quer que seus posts soem?</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {TONES.map((t) => (
                    <button
                      key={t.value}
                      onClick={() => setTone(t.value)}
                      className={cn(
                        "p-4 rounded-xl border-2 text-left transition-all",
                        tone === t.value
                          ? "border-blue-600 bg-blue-50"
                          : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                      )}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg">{t.emoji}</span>
                        <span className="font-medium text-gray-900 text-sm">{t.label}</span>
                        {tone === t.value && (
                          <Check className="h-3.5 w-3.5 text-blue-600 ml-auto" />
                        )}
                      </div>
                      <p className="text-xs text-gray-500">{t.description}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Step 3 — Visual identity */}
            {step === 3 && (
              <div className="space-y-5">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Identidade visual</h2>
                  <p className="text-sm text-gray-500 mt-1">Defina as cores e envie seu logotipo.</p>
                </div>

                <div className="space-y-2">
                  <Label>Paleta de cores</Label>
                  <div className="flex gap-4">
                    {colors.map((color, i) => (
                      <div key={i} className="flex flex-col items-center gap-1.5">
                        <div className="relative">
                          <input
                            type="color"
                            value={color}
                            onChange={(e) => {
                              const c = [...colors];
                              c[i] = e.target.value;
                              setColors(c);
                            }}
                            className="w-14 h-14 rounded-xl cursor-pointer border-2 border-gray-200 p-0.5"
                          />
                        </div>
                        <span className="text-xs text-gray-500">
                          {["Principal", "Secundária", "Fundo"][i]}
                        </span>
                        <span className="text-xs font-mono text-gray-400">{color}</span>
                      </div>
                    ))}
                    <div className="flex items-center gap-2 ml-4">
                      {colors.map((c, i) => (
                        <div
                          key={i}
                          className="w-10 h-10 rounded-lg border border-gray-200 shadow-sm"
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Logotipo (opcional)</Label>
                  {logoPreview ? (
                    <div className="flex items-center gap-4 p-4 border-2 border-gray-200 rounded-xl bg-gray-50">
                      <div className="relative h-16 w-16 shrink-0 rounded-lg border border-gray-200 bg-white overflow-hidden">
                        <Image
                          src={logoPreview}
                          alt="Logo"
                          fill
                          sizes="64px"
                          className="object-contain p-1"
                          unoptimized
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {logoFile?.name ?? "Logo atual"}
                        </p>
                        {logoFile && (
                          <p className="text-xs text-gray-400">
                            {(logoFile.size / 1024).toFixed(0)} KB
                          </p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setLogoFile(null);
                          setLogoPreview(null);
                          if (logoRef.current) logoRef.current.value = "";
                        }}
                        className="text-red-500 hover:text-red-600 hover:bg-red-50"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-xl p-8 cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-all">
                      <input
                        ref={logoRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/svg+xml"
                        onChange={handleLogo}
                        className="hidden"
                      />
                      <Upload className="h-8 w-8 text-gray-300 mb-2" />
                      <p className="text-sm text-gray-500 font-medium">Clique para fazer upload</p>
                      <p className="text-xs text-gray-400 mt-1">PNG, JPG, WebP ou SVG até 5MB</p>
                    </label>
                  )}
                </div>
              </div>
            )}

            {error && (
              <div className="mt-4 p-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-600">
                {error}
              </div>
            )}

            {successMessage && (
              <div className="mt-4 p-3 bg-green-50 border border-green-100 rounded-lg text-sm text-green-700 flex items-center gap-2">
                <Check className="h-4 w-4 shrink-0" />
                {successMessage}
              </div>
            )}

            <div className="flex justify-between mt-8 pt-6 border-t border-gray-100">
              {step > 1 ? (
                <Button variant="outline" onClick={() => setStep(step - 1)}>
                  Voltar
                </Button>
              ) : (
                <div />
              )}

              {step < 3 ? (
                <Button
                  variant="gradient"
                  onClick={() => setStep(step + 1)}
                  disabled={step === 1 && !companyName}
                >
                  Próximo
                </Button>
              ) : (
                <Button
                  variant="gradient"
                  onClick={handleFinish}
                  disabled={loading || !companyName}
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Salvando...
                    </>
                  ) : isCreateMode ? (
                    <>
                      <Check className="h-4 w-4" />
                      Criar empresa
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4" />
                      Salvar configurações
                    </>
                  )}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Page export — wraps form in Suspense because
// useSearchParams() requires it in Next.js App Router
// ─────────────────────────────────────────────

export default function OnboardingPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      }
    >
      <OnboardingForm />
    </Suspense>
  );
}
