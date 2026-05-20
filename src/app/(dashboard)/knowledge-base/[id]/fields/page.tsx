"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import {
  List,
  PlusCircle,
  Trash2,
  X,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Upload,
  ChevronRight,
} from "lucide-react";
import { DashboardLayout } from "@client/components/layout/dashboard-layout";
import { useRouter } from "next/navigation";

// ─── Types ───────────────────────────────────────────────────────────────────

interface CatalogField {
  id: string;
  name: string;
  dataType: string;
  isFilterable: boolean;
  displayOrder: number;
}

interface InferredField {
  name: string;
  dataType: string;
  sampleValues?: string[];
}

const DATA_TYPES = [
  { value: "string", label: "Texto curto (string)" },
  { value: "number", label: "Número" },
  { value: "boolean", label: "Booleano (true/false)" },
  { value: "date", label: "Data (YYYY-MM-DD)" },
  { value: "text", label: "Texto longo (text)" },
];

const FIELD_LIMIT = 50;

// ─── Page ────────────────────────────────────────────────────────────────────

export default function CatalogFieldsPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [fields, setFields] = useState<CatalogField[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Add field form
  const [showAddForm, setShowAddForm] = useState(false);
  const [fieldName, setFieldName] = useState("");
  const [fieldDataType, setFieldDataType] = useState("string");
  const [fieldIsFilterable, setFieldIsFilterable] = useState(false);
  const [fieldNameError, setFieldNameError] = useState("");
  const [addError, setAddError] = useState("");
  const [addSuccess, setAddSuccess] = useState(false);
  const [adding, setAdding] = useState(false);

  // Delete
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState("");

  // CSV Infer
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [inferring, setInferring] = useState(false);
  const [inferError, setInferError] = useState("");
  const [inferredFields, setInferredFields] = useState<InferredField[] | null>(null);
  const [inferConfirmError, setInferConfirmError] = useState("");
  const [confirmingSave, setConfirmingSave] = useState(false);

  useEffect(() => {
    fetchFields();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function fetchFields() {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch(`/api/knowledge-bases/${id}/fields`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error ?? "Falha ao carregar os campos.");
      }
      const data = await res.json();
      setFields(data);
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : "Erro desconhecido.");
    } finally {
      setLoading(false);
    }
  }

  function validateField(): boolean {
    const namePattern = /^[a-zA-Z0-9_]+$/;
    if (!fieldName.trim()) {
      setFieldNameError("Nome é obrigatório.");
      return false;
    }
    if (fieldName.length > 50) {
      setFieldNameError("Nome deve ter no máximo 50 caracteres.");
      return false;
    }
    if (!namePattern.test(fieldName)) {
      setFieldNameError("Nome deve conter apenas letras, números e underscores.");
      return false;
    }
    setFieldNameError("");
    return true;
  }

  async function handleAddField(e: React.FormEvent) {
    e.preventDefault();
    if (!validateField()) return;
    setAdding(true);
    setAddError("");
    setAddSuccess(false);
    try {
      const res = await fetch(`/api/knowledge-bases/${id}/fields`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: fieldName, dataType: fieldDataType, isFilterable: fieldIsFilterable }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAddError(data?.error ?? "Erro ao criar o campo.");
        return;
      }
      setFields((prev) => [...prev, data]);
      setFieldName("");
      setFieldDataType("string");
      setFieldIsFilterable(false);
      setAddSuccess(true);
      setTimeout(() => setAddSuccess(false), 3000);
    } catch {
      setAddError("Erro de rede. Tente novamente.");
    } finally {
      setAdding(false);
    }
  }

  async function handleDeleteField(fieldId: string) {
    setDeletingId(fieldId);
    setDeleteError("");
    try {
      const res = await fetch(`/api/knowledge-bases/${id}/fields/${fieldId}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setDeleteError(d?.error ?? "Erro ao excluir o campo.");
        return;
      }
      setFields((prev) => prev.filter((f) => f.id !== fieldId));
      setDeleteConfirmId(null);
    } catch {
      setDeleteError("Erro de rede. Tente novamente.");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleCsvInfer(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setInferring(true);
    setInferError("");
    setInferredFields(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/knowledge-bases/${id}/fields/infer`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setInferError(data?.error ?? "Erro ao inferir campos do CSV.");
        return;
      }
      setInferredFields(data);
    } catch {
      setInferError("Erro de rede. Tente novamente.");
    } finally {
      setInferring(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleConfirmInferred() {
    if (!inferredFields) return;
    setConfirmingSave(true);
    setInferConfirmError("");
    const errors: string[] = [];
    let added = 0;
    for (const f of inferredFields) {
      try {
        const res = await fetch(`/api/knowledge-bases/${id}/fields`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: f.name, dataType: f.dataType, isFilterable: false }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          errors.push(`${f.name}: ${d?.error ?? "erro"}`);
        } else {
          const newField = await res.json();
          setFields((prev) => [...prev, newField]);
          added++;
        }
      } catch {
        errors.push(`${f.name}: erro de rede`);
      }
    }
    setConfirmingSave(false);
    if (errors.length > 0) {
      setInferConfirmError(`Alguns campos não foram criados: ${errors.join("; ")}`);
    } else {
      setInferredFields(null);
      setAddSuccess(true);
      setTimeout(() => setAddSuccess(false), 3000);
    }
    if (added > 0 && errors.length === 0) setInferredFields(null);
  }

  const atLimit = fields.length >= FIELD_LIMIT;

  return (
    <DashboardLayout>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <button onClick={() => router.push("/knowledge-base")} className="hover:text-gray-700">Base de Conhecimento</button>
        <ChevronRight className="h-4 w-4" />
        <button onClick={() => router.push(`/knowledge-base/${id}`)} className="hover:text-gray-700">Detalhes</button>
        <ChevronRight className="h-4 w-4" />
        <span className="text-gray-900 font-medium">Campos</span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50">
            <List className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Campos do Catálogo</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {fields.length}/{FIELD_LIMIT} campos definidos
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label
            className={`inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer ${atLimit || inferring ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            {inferring ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Inferir do CSV
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              disabled={atLimit || inferring}
              onChange={handleCsvInfer}
            />
          </label>
          <button
            onClick={() => { setShowAddForm(true); setFieldName(""); setFieldDataType("string"); setFieldIsFilterable(false); setFieldNameError(""); setAddError(""); }}
            disabled={atLimit}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <PlusCircle className="h-4 w-4" />
            Adicionar Campo
          </button>
        </div>
      </div>

      {atLimit && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 mb-4">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          Limite de {FIELD_LIMIT} campos atingido. Exclua campos existentes para adicionar novos.
        </div>
      )}

      {inferError && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 mb-4">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {inferError}
        </div>
      )}

      {addSuccess && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700 mb-4">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
          Campo(s) adicionado(s) com sucesso.
        </div>
      )}

      {/* Inferred Fields Confirmation */}
      {inferredFields && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-5 mb-6">
          <h3 className="font-semibold text-blue-900 mb-3">Campos inferidos do CSV — confirme antes de salvar</h3>
          {inferConfirmError && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 mb-3">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {inferConfirmError}
            </div>
          )}
          <div className="space-y-2 mb-4">
            {inferredFields.map((f, i) => (
              <div key={i} className="flex items-center gap-3 bg-white rounded-lg border border-blue-200 p-3">
                <input
                  type="text"
                  value={f.name}
                  onChange={(e) => setInferredFields((prev) => prev ? prev.map((x, j) => j === i ? { ...x, name: e.target.value } : x) : prev)}
                  className="flex-1 rounded border border-gray-200 px-2 py-1 text-sm outline-none focus:border-blue-500"
                />
                <select
                  value={f.dataType}
                  onChange={(e) => setInferredFields((prev) => prev ? prev.map((x, j) => j === i ? { ...x, dataType: e.target.value } : x) : prev)}
                  className="rounded border border-gray-200 px-2 py-1 text-sm outline-none focus:border-blue-500"
                >
                  {DATA_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
                {f.sampleValues && f.sampleValues.length > 0 && (
                  <span className="text-xs text-gray-400 truncate max-w-[120px]">
                    ex: {f.sampleValues.slice(0, 2).join(", ")}
                  </span>
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleConfirmInferred}
              disabled={confirmingSave}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60 transition-colors"
            >
              {confirmingSave && <Loader2 className="h-4 w-4 animate-spin" />}
              Confirmar e Salvar
            </button>
            <button
              onClick={() => setInferredFields(null)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Add Field Form */}
      {showAddForm && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 mb-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">Adicionar Campo</h3>
            <button onClick={() => setShowAddForm(false)} className="text-gray-400 hover:text-gray-600">
              <X className="h-5 w-5" />
            </button>
          </div>
          {addError && (
            <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 mb-3">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {addError}
            </div>
          )}
          <form onSubmit={handleAddField} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nome <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={fieldName}
                onChange={(e) => setFieldName(e.target.value)}
                placeholder="ex: preco_venda"
                maxLength={50}
                className={`w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500 ${fieldNameError ? "border-red-400 bg-red-50" : "border-gray-300"}`}
              />
              {fieldNameError && <p className="mt-1 text-xs text-red-500">{fieldNameError}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
              <select
                value={fieldDataType}
                onChange={(e) => setFieldDataType(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              >
                {DATA_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col justify-end gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={fieldIsFilterable}
                  onChange={(e) => setFieldIsFilterable(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600"
                />
                <span className="text-sm text-gray-700">Filtrável</span>
              </label>
              <button
                type="submit"
                disabled={adding}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60 transition-colors"
              >
                {adding && <Loader2 className="h-4 w-4 animate-spin" />}
                Adicionar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Fields Table */}
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
        ) : fields.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <List className="h-10 w-10 text-gray-300 mb-3" />
            <p className="text-gray-500 font-medium">Nenhum campo definido</p>
            <p className="text-sm text-gray-400 mt-1">Adicione campos manualmente ou importe a partir de um CSV.</p>
          </div>
        ) : (
          <>
            {deleteError && (
              <div className="flex items-center gap-2 p-3 border-b border-red-200 bg-red-50 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                {deleteError}
              </div>
            )}
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-xs font-semibold uppercase text-gray-500">
                  <th className="px-4 py-3 text-left">Nome</th>
                  <th className="px-4 py-3 text-left">Tipo</th>
                  <th className="px-4 py-3 text-center">Filtrável</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {fields.map((field) => (
                  <tr key={field.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-gray-900">{field.name}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {DATA_TYPES.find((t) => t.value === field.dataType)?.label ?? field.dataType}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {field.isFilterable ? (
                        <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Sim</span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">Não</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {deleteConfirmId === field.id ? (
                        <div className="flex items-center justify-end gap-2">
                          <span className="text-xs text-gray-500">Confirmar?</span>
                          <button
                            onClick={() => handleDeleteField(field.id)}
                            disabled={deletingId === field.id}
                            className="inline-flex items-center gap-1 rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-60"
                          >
                            {deletingId === field.id ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                            Excluir
                          </button>
                          <button
                            onClick={() => setDeleteConfirmId(null)}
                            className="rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setDeleteConfirmId(field.id); setDeleteError(""); }}
                          className="inline-flex items-center gap-1 rounded-lg p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          aria-label="Excluir campo"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
