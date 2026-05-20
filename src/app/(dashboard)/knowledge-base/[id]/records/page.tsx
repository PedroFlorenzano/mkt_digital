"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Database,
  PlusCircle,
  Trash2,
  X,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Upload,
  ChevronRight,
  ChevronLeft,
  AlertTriangle,
} from "lucide-react";
import { DashboardLayout } from "@client/components/layout/dashboard-layout";

// ─── Types ───────────────────────────────────────────────────────────────────

interface CatalogField {
  id: string;
  name: string;
  dataType: string;
  isFilterable: boolean;
}

interface CatalogRecord {
  id: string;
  data: string;
  createdAt: string;
}

interface PaginatedRecords {
  items: CatalogRecord[];
  total: number;
}

const PAGE_SIZE = 50;
const RECORD_LIMIT = 50000;

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function getFieldPlaceholder(dataType: string): string {
  switch (dataType) {
    case "number": return "Ex: 42.5";
    case "boolean": return "true ou false";
    case "date": return "YYYY-MM-DD";
    default: return "Valor";
  }
}

function validateFieldValue(value: string, dataType: string): string {
  if (!value.trim()) return "";
  if (dataType === "number") {
    if (isNaN(parseFloat(value)) || !/^-?\d+(\.\d+)?$/.test(value.trim())) {
      return "Número inválido (use ponto como separador decimal)";
    }
  }
  if (dataType === "boolean") {
    if (!["true", "false"].includes(value.trim().toLowerCase())) {
      return 'Use "true" ou "false"';
    }
  }
  if (dataType === "date") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
      return "Data inválida (use YYYY-MM-DD)";
    }
  }
  return "";
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function CatalogRecordsPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [fields, setFields] = useState<CatalogField[]>([]);
  const [records, setRecords] = useState<CatalogRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Create form
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);

  // Delete
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState("");

  // Clear all
  const [showClearModal, setShowClearModal] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState("");
  const [clearSuccess, setClearSuccess] = useState(false);

  // CSV upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ created: number; errors: number; errorDetails?: { row: number; error: string }[] } | null>(null);
  const [uploadError, setUploadError] = useState("");

  useEffect(() => {
    Promise.all([fetchFields(), fetchRecords(1)]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function fetchFields() {
    try {
      const res = await fetch(`/api/knowledge-bases/${id}/fields`);
      if (res.ok) {
        const data = await res.json();
        setFields(data);
      }
    } catch { /* ignore */ }
  }

  async function fetchRecords(p: number) {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch(`/api/knowledge-bases/${id}/records?page=${p}&pageSize=${PAGE_SIZE}`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error ?? "Falha ao carregar os registros.");
      }
      const data: PaginatedRecords = await res.json();
      setRecords(data.items);
      setTotal(data.total);
      setPage(p);
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : "Erro desconhecido.");
    } finally {
      setLoading(false);
    }
  }

  function validateForm(): boolean {
    const errors: Record<string, string> = {};
    for (const field of fields) {
      const value = formValues[field.name] ?? "";
      const err = validateFieldValue(value, field.dataType);
      if (err) errors[field.name] = err;
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!validateForm()) return;
    setCreating(true);
    setCreateError("");
    try {
      const data: Record<string, unknown> = {};
      for (const field of fields) {
        const raw = formValues[field.name]?.trim() ?? "";
        if (!raw) continue;
        if (field.dataType === "number") data[field.name] = parseFloat(raw);
        else if (field.dataType === "boolean") data[field.name] = raw.toLowerCase() === "true";
        else data[field.name] = raw;
      }
      const res = await fetch(`/api/knowledge-bases/${id}/records`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (!res.ok) {
        setCreateError(result?.error ?? "Erro ao criar o registro.");
        return;
      }
      setFormValues({});
      setShowCreateForm(false);
      fetchRecords(1);
    } catch {
      setCreateError("Erro de rede. Tente novamente.");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(recordId: string) {
    setDeletingId(recordId);
    setDeleteError("");
    try {
      const res = await fetch(`/api/knowledge-bases/${id}/records/${recordId}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setDeleteError(d?.error ?? "Erro ao excluir o registro.");
        return;
      }
      setDeleteConfirmId(null);
      fetchRecords(page);
    } catch {
      setDeleteError("Erro de rede.");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleClearAll() {
    setClearing(true);
    setClearError("");
    try {
      const res = await fetch(`/api/knowledge-bases/${id}/records`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setClearError(d?.error ?? "Erro ao limpar registros.");
        return;
      }
      setShowClearModal(false);
      setClearSuccess(true);
      setTimeout(() => setClearSuccess(false), 3000);
      fetchRecords(1);
    } catch {
      setClearError("Erro de rede.");
    } finally {
      setClearing(false);
    }
  }

  async function handleCsvUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError("");
    setUploadResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/knowledge-bases/${id}/records/upload`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setUploadError(data?.error ?? "Erro ao processar o CSV.");
        return;
      }
      setUploadResult(data);
      fetchRecords(1);
    } catch {
      setUploadError("Erro de rede.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const atLimit = total >= RECORD_LIMIT;

  function parsedData(dataStr: string): Record<string, unknown> {
    try { return JSON.parse(dataStr); } catch { return {}; }
  }

  return (
    <DashboardLayout>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <button onClick={() => router.push("/knowledge-base")} className="hover:text-gray-700">Base de Conhecimento</button>
        <ChevronRight className="h-4 w-4" />
        <button onClick={() => router.push(`/knowledge-base/${id}`)} className="hover:text-gray-700">Detalhes</button>
        <ChevronRight className="h-4 w-4" />
        <span className="text-gray-900 font-medium">Registros</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50">
            <Database className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Registros do Catálogo</h1>
            <p className="text-sm text-gray-500 mt-0.5">{total.toLocaleString("pt-BR")} registros</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className={`inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer ${uploading ? "opacity-50 cursor-not-allowed" : ""}`}>
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Upload CSV
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              disabled={uploading}
              onChange={handleCsvUpload}
            />
          </label>
          <button
            onClick={() => { setShowClearModal(true); setClearError(""); }}
            disabled={total === 0}
            className="inline-flex items-center gap-2 rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-40 transition-colors"
          >
            <Trash2 className="h-4 w-4" />
            Limpar Tudo
          </button>
          <button
            onClick={() => { setShowCreateForm(true); setFormValues({}); setFormErrors({}); setCreateError(""); }}
            disabled={atLimit || fields.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <PlusCircle className="h-4 w-4" />
            Novo Registro
          </button>
        </div>
      </div>

      {atLimit && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 mb-4">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          Limite de {RECORD_LIMIT.toLocaleString("pt-BR")} registros atingido. Exclua registros para adicionar novos.
        </div>
      )}

      {fields.length === 0 && !loading && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 mb-4">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          Nenhum campo definido. Defina campos antes de adicionar registros.
        </div>
      )}

      {clearSuccess && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700 mb-4">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
          Todos os registros foram excluídos com sucesso.
        </div>
      )}

      {uploadError && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 mb-4">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {uploadError}
        </div>
      )}

      {uploadResult && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 mb-4">
          <div className="flex items-center gap-2 text-green-700 mb-1">
            <CheckCircle2 className="h-4 w-4" />
            <span className="font-medium">CSV processado</span>
          </div>
          <p className="text-sm text-green-600">{uploadResult.created} registro(s) criado(s)</p>
          {uploadResult.errors > 0 && (
            <p className="text-sm text-amber-600 mt-1">{uploadResult.errors} linha(s) com erro</p>
          )}
          {uploadResult.errorDetails && uploadResult.errorDetails.length > 0 && (
            <div className="mt-2 text-xs text-red-600 max-h-24 overflow-y-auto">
              {uploadResult.errorDetails.slice(0, 5).map((e, i) => (
                <div key={i}>Linha {e.row}: {e.error}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create Form */}
      {showCreateForm && fields.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 mb-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">Novo Registro</h3>
            <button onClick={() => setShowCreateForm(false)}>
              <X className="h-5 w-5 text-gray-400 hover:text-gray-600" />
            </button>
          </div>
          {createError && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 mb-3">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {createError}
            </div>
          )}
          <form onSubmit={handleCreate} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {fields.map((field) => (
              <div key={field.id}>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {field.name}
                  <span className="ml-1 text-xs text-gray-400">({field.dataType})</span>
                </label>
                <input
                  type="text"
                  value={formValues[field.name] ?? ""}
                  onChange={(e) => setFormValues((prev) => ({ ...prev, [field.name]: e.target.value }))}
                  placeholder={getFieldPlaceholder(field.dataType)}
                  className={`w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500 ${formErrors[field.name] ? "border-red-400 bg-red-50" : "border-gray-300"}`}
                />
                {formErrors[field.name] && (
                  <p className="mt-1 text-xs text-red-500">{formErrors[field.name]}</p>
                )}
              </div>
            ))}
            <div className="sm:col-span-2 lg:col-span-3 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={creating}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                Salvar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Records Table */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-7 w-7 animate-spin text-blue-500" />
          </div>
        ) : fetchError ? (
          <div className="flex items-center gap-3 p-6 text-red-700">
            <AlertCircle className="h-5 w-5" />
            {fetchError}
          </div>
        ) : records.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Database className="h-10 w-10 text-gray-300 mb-3" />
            <p className="text-gray-500 font-medium">Nenhum registro</p>
            <p className="text-sm text-gray-400 mt-1">Adicione registros manualmente ou via upload de CSV.</p>
          </div>
        ) : (
          <>
            {deleteError && (
              <div className="flex items-center gap-2 p-3 border-b border-red-200 bg-red-50 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                {deleteError}
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50 text-xs font-semibold uppercase text-gray-500">
                    {fields.slice(0, 5).map((f) => (
                      <th key={f.id} className="px-4 py-3 text-left">{f.name}</th>
                    ))}
                    {fields.length > 5 && <th className="px-4 py-3 text-left text-gray-400">+{fields.length - 5} campos</th>}
                    <th className="px-4 py-3 text-left">Criado em</th>
                    <th className="px-4 py-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((record) => {
                    const data = parsedData(record.data);
                    return (
                      <tr key={record.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                        {fields.slice(0, 5).map((f) => (
                          <td key={f.id} className="px-4 py-3 text-gray-700 max-w-[160px] truncate">
                            {data[f.name] !== undefined ? String(data[f.name]) : <span className="text-gray-300">—</span>}
                          </td>
                        ))}
                        {fields.length > 5 && <td className="px-4 py-3 text-gray-400">...</td>}
                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(record.createdAt)}</td>
                        <td className="px-4 py-3 text-right">
                          {deleteConfirmId === record.id ? (
                            <div className="flex items-center justify-end gap-2">
                              <span className="text-xs text-gray-500">Confirmar?</span>
                              <button
                                onClick={() => handleDelete(record.id)}
                                disabled={deletingId === record.id}
                                className="inline-flex items-center gap-1 rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-60"
                              >
                                {deletingId === record.id && <Loader2 className="h-3 w-3 animate-spin" />}
                                Excluir
                              </button>
                              <button
                                onClick={() => setDeleteConfirmId(null)}
                                className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
                              >
                                Cancelar
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => { setDeleteConfirmId(record.id); setDeleteError(""); }}
                              className="rounded-lg p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                              aria-label="Excluir registro"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3">
                <p className="text-sm text-gray-500">
                  Página {page} de {totalPages} · {total.toLocaleString("pt-BR")} registros
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => fetchRecords(page - 1)}
                    disabled={page <= 1}
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 transition-colors"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Anterior
                  </button>
                  <button
                    onClick={() => fetchRecords(page + 1)}
                    disabled={page >= totalPages}
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 transition-colors"
                  >
                    Próxima
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Clear All Modal */}
      {showClearModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="clear-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => !clearing && setShowClearModal(false)}
            aria-hidden="true"
          />
          <div className="relative z-10 w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 id="clear-modal-title" className="text-lg font-semibold text-gray-900">Limpar todos os registros</h2>
              <button
                aria-label="Fechar"
                onClick={() => setShowClearModal(false)}
                disabled={clearing}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-6 py-5">
              {clearError && (
                <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 mb-4">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  {clearError}
                </div>
              )}
              <div className="flex items-start gap-3 mb-5">
                <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-gray-700">
                    Esta ação removerá permanentemente <strong>todos os {total.toLocaleString("pt-BR")} registros</strong> do catálogo. Os campos definidos serão preservados.
                  </p>
                  <p className="text-sm text-red-600 mt-2">Esta ação não pode ser desfeita.</p>
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowClearModal(false)}
                  disabled={clearing}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleClearAll}
                  disabled={clearing}
                  className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
                >
                  {clearing && <Loader2 className="h-4 w-4 animate-spin" />}
                  Limpar Todos
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
