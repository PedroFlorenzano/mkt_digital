"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  BookOpen,
  Pencil,
  Trash2,
  X,
  Loader2,
  AlertCircle,
  CheckCircle2,
  List,
  Database,
  Bot,
  MessageSquare,
  ChevronRight,
  Tag,
  AlertTriangle,
} from "lucide-react";
import { DashboardLayout } from "@client/components/layout/dashboard-layout";

// ─── Types ───────────────────────────────────────────────────────────────────

interface KnowledgeBase {
  id: string;
  name: string;
  catalogType: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

interface KBAgent {
  id: string;
  status: string;
}

const CATALOG_TYPES: Record<string, string> = {
  imoveis: "Imóveis",
  produtos: "Produtos",
  veiculos: "Veículos",
  servicos: "Serviços",
  outro: "Outro",
};

function catalogTypeLabel(value: string): string {
  return CATALOG_TYPES[value] ?? value;
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function KnowledgeBaseDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [kb, setKb] = useState<KnowledgeBase | null>(null);
  const [agent, setAgent] = useState<KBAgent | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Edit form
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editNameError, setEditNameError] = useState("");
  const [editDescError, setEditDescError] = useState("");
  const [editError, setEditError] = useState("");
  const [editSuccess, setEditSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  // Delete modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function fetchData() {
    setLoading(true);
    setFetchError(null);
    try {
      const [kbRes, agentRes] = await Promise.all([
        fetch(`/api/knowledge-bases/${id}`),
        fetch(`/api/knowledge-bases/${id}/agent`),
      ]);
      if (!kbRes.ok) {
        const d = await kbRes.json().catch(() => ({}));
        throw new Error(d?.error ?? "Falha ao carregar a base de conhecimento.");
      }
      const kbData: KnowledgeBase = await kbRes.json();
      setKb(kbData);
      setEditName(kbData.name);
      setEditDescription(kbData.description ?? "");

      if (agentRes.ok) {
        const agentData = await agentRes.json();
        setAgent(agentData ?? null);
      } else {
        setAgent(null);
      }
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : "Erro desconhecido.");
    } finally {
      setLoading(false);
    }
  }

  function validateEdit(): boolean {
    let valid = true;
    if (!editName.trim() || editName.trim().length > 100) {
      setEditNameError("Nome é obrigatório e deve ter no máximo 100 caracteres.");
      valid = false;
    } else {
      setEditNameError("");
    }
    if (editDescription.length > 500) {
      setEditDescError("Descrição deve ter no máximo 500 caracteres.");
      valid = false;
    } else {
      setEditDescError("");
    }
    return valid;
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!validateEdit()) return;
    setSaving(true);
    setEditError("");
    setEditSuccess(false);
    try {
      const res = await fetch(`/api/knowledge-bases/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          description: editDescription.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEditError(data?.error ?? "Erro ao salvar alterações.");
        return;
      }
      setKb(data);
      setEditSuccess(true);
      setTimeout(() => setEditSuccess(false), 3000);
    } catch {
      setEditError("Erro de rede. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setDeleteError("");
    try {
      const res = await fetch(`/api/knowledge-bases/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setDeleteError(data?.error ?? "Erro ao excluir a base.");
        return;
      }
      router.push("/knowledge-base");
    } catch {
      setDeleteError("Erro de rede. Tente novamente.");
    } finally {
      setDeleting(false);
    }
  }

  const hasActiveAgent = agent?.status === "active";

  const navLinks = [
    { href: `/knowledge-base/${id}/fields`, icon: List, label: "Campos", description: "Defina a estrutura do catálogo" },
    { href: `/knowledge-base/${id}/records`, icon: Database, label: "Registros", description: "Gerencie os dados do catálogo" },
    { href: `/knowledge-base/${id}/agent`, icon: Bot, label: "Agente", description: "Configure o agente WhatsApp" },
    { href: `/knowledge-base/${id}/conversations`, icon: MessageSquare, label: "Conversas", description: "Veja o histórico de conversas" },
  ];

  return (
    <DashboardLayout>
      {/* ── Header ── */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.push("/knowledge-base")}
          className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          Base de Conhecimento
        </button>
        <ChevronRight className="h-4 w-4 text-gray-400" />
        <span className="text-sm text-gray-900 font-medium">{kb?.name ?? "..."}</span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-7 w-7 animate-spin text-blue-500" />
        </div>
      ) : fetchError ? (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          <span>{fetchError}</span>
        </div>
      ) : kb ? (
        <div className="space-y-6">
          {/* KB Info Header */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50">
                  <BookOpen className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">{kb.name}</h1>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="inline-flex items-center gap-1 text-sm text-gray-500">
                      <Tag className="h-3.5 w-3.5" />
                      {catalogTypeLabel(kb.catalogType)}
                    </span>
                    {hasActiveAgent && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                        Agente ativo
                      </span>
                    )}
                  </div>
                  {kb.description && (
                    <p className="mt-2 text-sm text-gray-600 max-w-xl">{kb.description}</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Navigation Cards */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {navLinks.map(({ href, icon: Icon, label, description }) => (
              <button
                key={href}
                onClick={() => router.push(href)}
                className="text-left rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:shadow-md hover:border-blue-300 transition-all"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 mb-3">
                  <Icon className="h-4 w-4 text-blue-600" />
                </div>
                <p className="font-semibold text-gray-900 text-sm">{label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{description}</p>
              </button>
            ))}
          </div>

          {/* Edit Form */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Pencil className="h-4 w-4" /> Editar Base
            </h2>
            <form onSubmit={handleSave} className="space-y-4">
              {editError && (
                <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  {editError}
                </div>
              )}
              {editSuccess && (
                <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
                  <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                  Alterações salvas com sucesso.
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nome <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  maxLength={100}
                  className={`w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500 ${editNameError ? "border-red-400 bg-red-50" : "border-gray-300"}`}
                />
                {editNameError && <p className="mt-1 text-xs text-red-500">{editNameError}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Descrição <span className="text-gray-400 font-normal">(opcional)</span>
                </label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  rows={3}
                  maxLength={500}
                  className={`w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none ${editDescError ? "border-red-400 bg-red-50" : "border-gray-300"}`}
                />
                {editDescError && <p className="mt-1 text-xs text-red-500">{editDescError}</p>}
                <p className="mt-1 text-xs text-gray-400 text-right">{editDescription.length}/500</p>
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60 transition-colors"
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  Salvar
                </button>
              </div>
            </form>
          </div>

          {/* Danger Zone */}
          <div className="rounded-xl border border-red-200 bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold text-red-700 mb-2 flex items-center gap-2">
              <Trash2 className="h-4 w-4" /> Zona de Perigo
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              A exclusão é irreversível. Todos os campos, registros e o agente vinculado serão removidos permanentemente.
            </p>
            {hasActiveAgent && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 mb-4">
                <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span>Esta base possui um agente ativo. Ao excluí-la, o agente também será removido e deixará de responder mensagens.</span>
              </div>
            )}
            <button
              onClick={() => setShowDeleteModal(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 transition-colors"
            >
              <Trash2 className="h-4 w-4" />
              Excluir Base de Conhecimento
            </button>
          </div>
        </div>
      ) : null}

      {/* ── Delete Confirmation Modal ── */}
      {showDeleteModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-kb-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => !deleting && setShowDeleteModal(false)}
            aria-hidden="true"
          />
          <div className="relative z-10 w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 id="delete-kb-modal-title" className="text-lg font-semibold text-gray-900">
                Confirmar exclusão
              </h2>
              <button
                aria-label="Fechar"
                onClick={() => setShowDeleteModal(false)}
                disabled={deleting}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors disabled:opacity-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-6 py-5">
              {deleteError && (
                <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 mb-4">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  {deleteError}
                </div>
              )}
              <p className="text-sm text-gray-700">
                Tem certeza que deseja excluir a base{" "}
                <span className="font-semibold">"{kb?.name}"</span>? Essa ação não pode ser desfeita.
              </p>
              {hasActiveAgent && (
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <span>O agente ativo vinculado a esta base também será excluído.</span>
                </div>
              )}
              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => setShowDeleteModal(false)}
                  disabled={deleting}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60 transition-colors"
                >
                  {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
                  Excluir
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
