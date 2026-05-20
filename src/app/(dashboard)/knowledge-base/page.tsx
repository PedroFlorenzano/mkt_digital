"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  PlusCircle,
  X,
  Calendar,
  Tag,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { DashboardLayout } from "@client/components/layout/dashboard-layout";

// ─── Types ───────────────────────────────────────────────────────────────────

interface KnowledgeBase {
  id: string;
  name: string;
  catalogType: string;
  description?: string;
  createdAt: string;
}

const CATALOG_TYPES = [
  { value: "imoveis", label: "Imóveis" },
  { value: "produtos", label: "Produtos" },
  { value: "veiculos", label: "Veículos" },
  { value: "servicos", label: "Serviços" },
  { value: "outro", label: "Outro" },
];

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function catalogTypeLabel(value: string): string {
  return CATALOG_TYPES.find((t) => t.value === value)?.label ?? value;
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function KnowledgeBasePage() {
  const router = useRouter();
  const [bases, setBases] = useState<KnowledgeBase[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [catalogType, setCatalogType] = useState("");
  const [description, setDescription] = useState("");
  const [nameError, setNameError] = useState("");
  const [catalogTypeError, setCatalogTypeError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchBases();
  }, []);

  async function fetchBases() {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch("/api/knowledge-bases");
      if (!res.ok) throw new Error("Falha ao carregar as bases de conhecimento.");
      const data = await res.json();
      setBases(data);
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : "Erro desconhecido.");
    } finally {
      setLoading(false);
    }
  }

  function openModal() {
    setName("");
    setCatalogType("");
    setDescription("");
    setNameError("");
    setCatalogTypeError("");
    setSubmitError("");
    setShowModal(true);
  }

  function validate(): boolean {
    let valid = true;
    if (!name.trim() || name.trim().length > 100) {
      setNameError("Nome é obrigatório e deve ter no máximo 100 caracteres.");
      valid = false;
    } else {
      setNameError("");
    }
    if (!catalogType) {
      setCatalogTypeError("Selecione um tipo de catálogo.");
      valid = false;
    } else {
      setCatalogTypeError("");
    }
    return valid;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      const res = await fetch("/api/knowledge-bases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), catalogType, description: description.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data?.error ?? "Erro ao criar a base de conhecimento.");
        return;
      }
      setShowModal(false);
      router.push(`/knowledge-base/${data.id}`);
    } catch {
      setSubmitError("Erro de rede. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DashboardLayout>
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50">
            <BookOpen className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Base de Conhecimento</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Gerencie suas bases de conhecimento proprietárias para o agente de IA
            </p>
          </div>
        </div>
        <button
          onClick={openModal}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          <PlusCircle className="h-4 w-4" />
          Nova Base
        </button>
      </div>

      <div className="h-px bg-gray-200 mb-6" />

      {/* ── How it works ── */}
      <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 mb-6">
        <p className="text-sm font-semibold text-blue-900 mb-2">Como funciona</p>
        <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
          <li>Crie uma <strong>Base de Conhecimento</strong> e defina os <strong>Campos</strong> do seu catálogo (ex: nome, preço, cidade).</li>
          <li>Importe seus dados via <strong>upload de CSV</strong> ou cadastre registros manualmente.</li>
          <li>Configure um <strong>Agente WhatsApp</strong> vinculado a esta base — ele usará os dados para responder seus clientes automaticamente.</li>
          <li>Acompanhe todas as interações na aba <strong>Conversas</strong>.</li>
        </ol>
      </div>

      {/* ── Content ── */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-7 w-7 animate-spin text-blue-500" />
        </div>
      ) : fetchError ? (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <span>{fetchError}</span>
        </div>
      ) : bases.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 py-20 text-center">
          <BookOpen className="h-12 w-12 text-gray-300 mb-3" />
          <p className="text-lg font-medium text-gray-500">Nenhuma base de conhecimento</p>
          <p className="text-sm text-gray-400 mt-1 mb-5">
            Crie sua primeira base para começar a usar o agente de IA.
          </p>
          <button
            onClick={openModal}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            <PlusCircle className="h-4 w-4" />
            Nova Base
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {bases.map((kb) => (
            <button
              key={kb.id}
              onClick={() => router.push(`/knowledge-base/${kb.id}`)}
              className="text-left rounded-xl border border-gray-200 bg-white p-5 shadow-sm hover:shadow-md hover:border-blue-300 transition-all"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50">
                  <BookOpen className="h-4 w-4 text-blue-600" />
                </div>
              </div>
              <h3 className="font-semibold text-gray-900 mb-1 line-clamp-1">{kb.name}</h3>
              {kb.description && (
                <p className="text-sm text-gray-500 mb-3 line-clamp-2">{kb.description}</p>
              )}
              <div className="flex items-center gap-3 text-xs text-gray-400 mt-2">
                <span className="flex items-center gap-1">
                  <Tag className="h-3 w-3" />
                  {catalogTypeLabel(kb.catalogType)}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {formatDate(kb.createdAt)}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* ── Create Modal ── */}
      {showModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-kb-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowModal(false)}
            aria-hidden="true"
          />
          <div className="relative z-10 w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 id="create-kb-modal-title" className="text-lg font-semibold text-gray-900">
                Nova Base de Conhecimento
              </h2>
              <button
                aria-label="Fechar"
                onClick={() => setShowModal(false)}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
              {submitError && (
                <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  {submitError}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nome <span className="text-red-500">*</span>
                </label>
                <p className="text-xs text-gray-500 mb-1">Um nome descritivo para identificar esta base. Ex: "Catálogo de Imóveis SP".</p>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Catálogo de Imóveis SP"
                  maxLength={100}
                  className={`w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500 ${nameError ? "border-red-400 bg-red-50" : "border-gray-300"}`}
                />
                {nameError && <p className="mt-1 text-xs text-red-500">{nameError}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tipo de Catálogo <span className="text-red-500">*</span>
                </label>
                <p className="text-xs text-gray-500 mb-1">Categoria principal dos itens que serão cadastrados. Ajuda o agente a contextualizar as respostas.</p>
                <select
                  value={catalogType}
                  onChange={(e) => setCatalogType(e.target.value)}
                  className={`w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500 ${catalogTypeError ? "border-red-400 bg-red-50" : "border-gray-300"}`}
                >
                  <option value="">Selecione um tipo...</option>
                  {CATALOG_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
                {catalogTypeError && <p className="mt-1 text-xs text-red-500">{catalogTypeError}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Descrição <span className="text-gray-400 font-normal">(opcional)</span>
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Descreva o conteúdo desta base..."
                  rows={3}
                  maxLength={500}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60 transition-colors"
                >
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  Criar Base
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
