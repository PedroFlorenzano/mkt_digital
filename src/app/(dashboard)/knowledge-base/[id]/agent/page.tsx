"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Bot,
  PlusCircle,
  Pencil,
  Trash2,
  X,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Copy,
  Pause,
  Play,
  ChevronRight,
  Eye,
  EyeOff,
} from "lucide-react";
import { DashboardLayout } from "@client/components/layout/dashboard-layout";

// ─── Types ───────────────────────────────────────────────────────────────────

interface KBAgent {
  id: string;
  name: string;
  instanceName: string;
  evolutionApiUrl: string;
  evolutionApiKey: string;
  systemPrompt: string;
  delaySeconds: number;
  maxMessagesPerDay: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface FormState {
  name: string;
  instanceName: string;
  evolutionApiUrl: string;
  evolutionApiKey: string;
  systemPrompt: string;
  delaySeconds: string;
  maxMessagesPerDay: string;
}

interface FormErrors {
  name?: string;
  instanceName?: string;
  evolutionApiUrl?: string;
  evolutionApiKey?: string;
  systemPrompt?: string;
  delaySeconds?: string;
  maxMessagesPerDay?: string;
}

const DEFAULT_FORM: FormState = {
  name: "",
  instanceName: "",
  evolutionApiUrl: "",
  evolutionApiKey: "",
  systemPrompt: "Você é um assistente de IA especializado em responder perguntas sobre nosso catálogo. Use a ferramenta de busca para encontrar as informações solicitadas. Seu nome é {{agentName}} e hoje é {{today}}.",
  delaySeconds: "3",
  maxMessagesPerDay: "50",
};

function validateForm(form: FormState, isEdit: boolean): FormErrors {
  const errors: FormErrors = {};
  if (!form.name.trim() || form.name.length > 100)
    errors.name = "Nome é obrigatório e deve ter no máximo 100 caracteres.";

  if (!isEdit) {
    if (!form.instanceName.trim() || form.instanceName.length > 60)
      errors.instanceName = "Instance name é obrigatório e deve ter no máximo 60 caracteres.";
    else if (!/^[a-zA-Z0-9-]+$/.test(form.instanceName))
      errors.instanceName = "Apenas letras, números e hífens são permitidos.";
  }

  try {
    const url = new URL(form.evolutionApiUrl);
    if (!["http:", "https:"].includes(url.protocol))
      errors.evolutionApiUrl = "URL deve começar com http:// ou https://.";
  } catch {
    errors.evolutionApiUrl = "URL inválida.";
  }

  if (!form.evolutionApiKey.trim())
    errors.evolutionApiKey = "Chave de API é obrigatória.";

  if (!form.systemPrompt.trim() || form.systemPrompt.length < 10 || form.systemPrompt.length > 5000)
    errors.systemPrompt = "Prompt deve ter entre 10 e 5000 caracteres.";

  const delay = parseInt(form.delaySeconds, 10);
  if (isNaN(delay) || delay < 1 || delay > 60)
    errors.delaySeconds = "Delay deve ser um inteiro entre 1 e 60 segundos.";

  const maxMsg = parseInt(form.maxMessagesPerDay, 10);
  if (isNaN(maxMsg) || maxMsg < 1 || maxMsg > 500)
    errors.maxMessagesPerDay = "Limite deve ser um inteiro entre 1 e 500.";

  return errors;
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function KBAgentPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const kbId = params.id;

  const [agent, setAgent] = useState<KBAgent | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [webhookUrl, setWebhookUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Form
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  // Toggle status
  const [toggling, setToggling] = useState(false);
  const [toggleError, setToggleError] = useState("");

  // Delete
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    fetchAgent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kbId]);

  async function fetchAgent() {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch(`/api/knowledge-bases/${kbId}/agent`);
      if (res.status === 404) {
        setAgent(null);
        return;
      }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error ?? "Falha ao carregar o agente.");
      }
      const data: KBAgent = await res.json();
      if (data) {
        setAgent(data);
        setForm({
          name: data.name,
          instanceName: data.instanceName,
          evolutionApiUrl: data.evolutionApiUrl,
          evolutionApiKey: data.evolutionApiKey,
          systemPrompt: data.systemPrompt,
          delaySeconds: String(data.delaySeconds),
          maxMessagesPerDay: String(data.maxMessagesPerDay),
        });
      } else {
        setAgent(null);
      }
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : "Erro desconhecido.");
    } finally {
      setLoading(false);
    }
  }

  function handleFormChange(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setFormErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const isEdit = !!agent;
    const errors = validateForm(form, isEdit);
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    setSaving(true);
    setSubmitError("");
    setSubmitSuccess(false);
    try {
      const body = {
        name: form.name.trim(),
        evolutionApiUrl: form.evolutionApiUrl.trim(),
        evolutionApiKey: form.evolutionApiKey.trim(),
        systemPrompt: form.systemPrompt.trim(),
        delaySeconds: parseInt(form.delaySeconds, 10),
        maxMessagesPerDay: parseInt(form.maxMessagesPerDay, 10),
        ...(!isEdit ? { instanceName: form.instanceName.trim() } : {}),
      };
      const res = await fetch(`/api/knowledge-bases/${kbId}/agent`, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data?.error ?? "Erro ao salvar o agente.");
        return;
      }
      setAgent(data.agent ?? data);
      if (!isEdit && data.webhookUrl) {
        setWebhookUrl(data.webhookUrl);
      }
      setSubmitSuccess(true);
      setTimeout(() => setSubmitSuccess(false), 4000);
    } catch {
      setSubmitError("Erro de rede. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleStatus() {
    if (!agent) return;
    setToggling(true);
    setToggleError("");
    try {
      const res = await fetch(`/api/knowledge-bases/${kbId}/agent/status`, { method: "PATCH" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setToggleError(d?.error ?? "Erro ao alterar status.");
        return;
      }
      const data = await res.json();
      setAgent((prev) => prev ? { ...prev, status: data.status } : prev);
    } catch {
      setToggleError("Erro de rede.");
    } finally {
      setToggling(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setDeleteError("");
    try {
      const res = await fetch(`/api/knowledge-bases/${kbId}/agent`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setDeleteError(d?.error ?? "Erro ao excluir o agente.");
        return;
      }
      setAgent(null);
      setWebhookUrl(null);
      setForm(DEFAULT_FORM);
      setShowDeleteModal(false);
    } catch {
      setDeleteError("Erro de rede.");
    } finally {
      setDeleting(false);
    }
  }

  function copyWebhook() {
    if (!webhookUrl) return;
    navigator.clipboard.writeText(webhookUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const isEdit = !!agent;

  return (
    <DashboardLayout>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <button onClick={() => router.push("/knowledge-base")} className="hover:text-gray-700">Base de Conhecimento</button>
        <ChevronRight className="h-4 w-4" />
        <button onClick={() => router.push(`/knowledge-base/${kbId}`)} className="hover:text-gray-700">Detalhes</button>
        <ChevronRight className="h-4 w-4" />
        <span className="text-gray-900 font-medium">Agente</span>
      </div>

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50">
          <Bot className="h-5 w-5 text-blue-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agente WhatsApp</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {isEdit ? "Gerencie a configuração do agente" : "Configure um agente para esta base de conhecimento"}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-7 w-7 animate-spin text-blue-500" />
        </div>
      ) : fetchError ? (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          <AlertCircle className="h-5 w-5 flex-shrink-0" />
          {fetchError}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Status + Actions (only when agent exists) */}
          {isEdit && agent && (
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${agent.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                  <span className={`h-2 w-2 rounded-full ${agent.status === "active" ? "bg-green-500" : "bg-gray-400"}`} />
                  {agent.status === "active" ? "Ativo" : "Pausado"}
                </span>
                <span className="text-sm text-gray-500">Instance: <code className="font-mono text-gray-700">{agent.instanceName}</code></span>
              </div>
              <div className="flex items-center gap-2">
                {toggleError && <span className="text-xs text-red-500">{toggleError}</span>}
                <button
                  onClick={handleToggleStatus}
                  disabled={toggling}
                  className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-60 ${agent.status === "active" ? "border-amber-300 text-amber-700 hover:bg-amber-50" : "border-green-300 text-green-700 hover:bg-green-50"}`}
                >
                  {toggling ? <Loader2 className="h-4 w-4 animate-spin" /> : agent.status === "active" ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  {agent.status === "active" ? "Pausar" : "Reativar"}
                </button>
                <button
                  onClick={() => { setShowDeleteModal(true); setDeleteError(""); }}
                  className="inline-flex items-center gap-2 rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                  Excluir
                </button>
              </div>
            </div>
          )}

          {/* Webhook URL (shown after creation or if agent exists) */}
          {(webhookUrl || isEdit) && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-5 shadow-sm">
              <p className="text-sm font-semibold text-blue-900 mb-2 flex items-center gap-2">
                🔗 URL do Webhook
              </p>
              <p className="text-xs text-blue-700 mb-3">Configure esta URL na sua instância EvolutionAPI para receber mensagens.</p>
              <div className="flex items-center gap-2 bg-white rounded-lg border border-blue-200 px-3 py-2">
                <code className="flex-1 text-sm font-mono text-gray-800 break-all">
                  {webhookUrl ?? (agent ? `/api/kb-agent/${agent.id}` : "")}
                </code>
                <button
                  onClick={copyWebhook}
                  className="flex-shrink-0 rounded p-1 text-blue-600 hover:bg-blue-100 transition-colors"
                  aria-label="Copiar URL"
                >
                  {copied ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
            </div>
          )}

          {/* Form */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-base font-semibold text-gray-900 mb-5 flex items-center gap-2">
              {isEdit ? <Pencil className="h-4 w-4" /> : <PlusCircle className="h-4 w-4" />}
              {isEdit ? "Editar Agente" : "Criar Agente"}
            </h2>
            {submitError && (
              <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 mb-4">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                {submitError}
              </div>
            )}
            {submitSuccess && (
              <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700 mb-4">
                <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                {isEdit ? "Agente atualizado com sucesso." : "Agente criado com sucesso!"}
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                {/* Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nome do Agente <span className="text-red-500">*</span>
                  </label>
                  <p className="text-xs text-gray-500 mb-1">Como o agente se identificará nas conversas. Ex: "Assistente Imóveis".</p>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => handleFormChange("name", e.target.value)}
                    placeholder="Ex: Assistente Imóveis"
                    maxLength={100}
                    className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 ${formErrors.name ? "border-red-400 bg-red-50" : "border-gray-300"}`}
                  />
                  {formErrors.name && <p className="mt-1 text-xs text-red-500">{formErrors.name}</p>}
                </div>

                {/* instanceName */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Instance Name {!isEdit && <span className="text-red-500">*</span>}
                  </label>
                  <p className="text-xs text-gray-500 mb-1">Nome exato da instância configurada na EvolutionAPI. Somente letras, números e hífens. Não pode ser alterado após criação.</p>
                  <input
                    type="text"
                    value={form.instanceName}
                    onChange={(e) => !isEdit && handleFormChange("instanceName", e.target.value)}
                    readOnly={isEdit}
                    placeholder="Ex: kb-imoveis-sp"
                    maxLength={60}
                    className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 ${isEdit ? "bg-gray-50 text-gray-500 cursor-not-allowed" : formErrors.instanceName ? "border-red-400 bg-red-50" : "border-gray-300"}`}
                  />
                  {isEdit && <p className="mt-1 text-xs text-gray-400">O instance name não pode ser alterado.</p>}
                  {formErrors.instanceName && <p className="mt-1 text-xs text-red-500">{formErrors.instanceName}</p>}
                </div>

                {/* Evolution API URL */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    URL da EvolutionAPI <span className="text-red-500">*</span>
                  </label>
                  <p className="text-xs text-gray-500 mb-1">Endereço do servidor onde a EvolutionAPI está instalada. Ex: <code className="bg-gray-100 px-1 rounded">https://evolution.suaempresa.com</code></p>
                  <input
                    type="url"
                    value={form.evolutionApiUrl}
                    onChange={(e) => handleFormChange("evolutionApiUrl", e.target.value)}
                    placeholder="https://api.exemplo.com"
                    className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 ${formErrors.evolutionApiUrl ? "border-red-400 bg-red-50" : "border-gray-300"}`}
                  />
                  {formErrors.evolutionApiUrl && <p className="mt-1 text-xs text-red-500">{formErrors.evolutionApiUrl}</p>}
                </div>

                {/* Evolution API Key */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Chave de API (EvolutionAPI) <span className="text-red-500">*</span>
                  </label>
                  <p className="text-xs text-gray-500 mb-1">Chave de autenticação da instância. Encontre-a nas configurações da EvolutionAPI ou no arquivo <code className="bg-gray-100 px-1 rounded">.env</code> do servidor.</p>
                  <div className="relative">
                    <input
                      type={showApiKey ? "text" : "password"}
                      value={form.evolutionApiKey}
                      onChange={(e) => handleFormChange("evolutionApiKey", e.target.value)}
                      placeholder="Sua chave de API"
                      className={`w-full rounded-lg border pr-10 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 ${formErrors.evolutionApiKey ? "border-red-400 bg-red-50" : "border-gray-300"}`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      aria-label={showApiKey ? "Ocultar chave" : "Mostrar chave"}
                    >
                      {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {formErrors.evolutionApiKey && <p className="mt-1 text-xs text-red-500">{formErrors.evolutionApiKey}</p>}
                </div>

                {/* Delay */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Delay entre mensagens (segundos) <span className="text-red-500">*</span>
                  </label>
                  <p className="text-xs text-gray-500 mb-1">Pausa antes de enviar a resposta. Simula digitação humana e evita bloqueios do WhatsApp (1–60 s).</p>
                  <input
                    type="number"
                    value={form.delaySeconds}
                    onChange={(e) => handleFormChange("delaySeconds", e.target.value)}
                    min={1}
                    max={60}
                    className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 ${formErrors.delaySeconds ? "border-red-400 bg-red-50" : "border-gray-300"}`}
                  />
                  {formErrors.delaySeconds && <p className="mt-1 text-xs text-red-500">{formErrors.delaySeconds}</p>}
                </div>

                {/* Max Messages */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Limite diário de mensagens por número <span className="text-red-500">*</span>
                  </label>
                  <p className="text-xs text-gray-500 mb-1">Máximo de mensagens que cada número pode enviar por dia. Protege contra abusos e loops (1–500).</p>
                  <input
                    type="number"
                    value={form.maxMessagesPerDay}
                    onChange={(e) => handleFormChange("maxMessagesPerDay", e.target.value)}
                    min={1}
                    max={500}
                    className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 ${formErrors.maxMessagesPerDay ? "border-red-400 bg-red-50" : "border-gray-300"}`}
                  />
                  {formErrors.maxMessagesPerDay && <p className="mt-1 text-xs text-red-500">{formErrors.maxMessagesPerDay}</p>}
                </div>
              </div>

              {/* System Prompt */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Prompt do Sistema <span className="text-red-500">*</span>
                </label>
                <p className="text-xs text-gray-500 mb-2">
                  Instruções que definem o comportamento do agente. Descreva o tom de voz, regras de atendimento e como ele deve usar os dados do catálogo para responder. Use <code className="bg-gray-100 px-1 rounded">{"{{agentName}}"}</code> para o nome do agente e <code className="bg-gray-100 px-1 rounded">{"{{today}}"}</code> para a data atual.
                </p>
                <textarea
                  value={form.systemPrompt}
                  onChange={(e) => handleFormChange("systemPrompt", e.target.value)}
                  rows={6}
                  maxLength={5000}
                  className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none ${formErrors.systemPrompt ? "border-red-400 bg-red-50" : "border-gray-300"}`}
                />
                <div className="flex justify-between mt-1">
                  {formErrors.systemPrompt ? (
                    <p className="text-xs text-red-500">{formErrors.systemPrompt}</p>
                  ) : <span />}
                  <p className="text-xs text-gray-400">{form.systemPrompt.length}/5000</p>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60 transition-colors"
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {isEdit ? "Salvar" : "Criar Agente"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {showDeleteModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-agent-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => !deleting && setShowDeleteModal(false)}
            aria-hidden="true"
          />
          <div className="relative z-10 w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 id="delete-agent-modal-title" className="text-lg font-semibold text-gray-900">Excluir Agente</h2>
              <button
                aria-label="Fechar"
                onClick={() => setShowDeleteModal(false)}
                disabled={deleting}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"
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
              <p className="text-sm text-gray-700 mb-2">
                Tem certeza que deseja excluir o agente <span className="font-semibold">"{agent?.name}"</span>?
              </p>
              <p className="text-sm text-red-600">Todo o histórico de conversas será removido. Esta ação não pode ser desfeita.</p>
              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => setShowDeleteModal(false)}
                  disabled={deleting}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
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
