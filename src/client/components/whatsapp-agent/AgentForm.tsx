"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@client/components/ui/button";
import { Input } from "@client/components/ui/input";
import { Label } from "@client/components/ui/label";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface AgentFormValues {
  name: string;
  description: string;
  instanceName: string;
  evolutionApiUrl: string;
  evolutionApiKey: string;
  systemPrompt: string;
  delaySeconds: number;
  maxMessagesPerSession: number;
}

export interface AgentFormProps {
  /** When provided the form runs in edit mode, pre-populating all fields. */
  initialValues?: Partial<AgentFormValues>;
  /** Called after a successful create/update. Receives the returned agent. */
  onSuccess: (agent: AgentFormValues & { id: string }) => void;
  /** Called when the user clicks Cancel (optional). */
  onCancel?: () => void;
  /** The agent id when editing. Omit (or undefined) for create mode. */
  agentId?: string;
}

// ─────────────────────────────────────────────
// Per-field validation (mirrors server-side rules)
// ─────────────────────────────────────────────

interface FieldErrors {
  name?: string;
  instanceName?: string;
  evolutionApiUrl?: string;
  evolutionApiKey?: string;
  systemPrompt?: string;
  delaySeconds?: string;
  maxMessagesPerSession?: string;
}

function validate(values: AgentFormValues): FieldErrors {
  const errors: FieldErrors = {};

  const name = values.name.trim();
  if (name.length === 0) {
    errors.name = "O nome é obrigatório.";
  } else if (name.length > 100) {
    errors.name = "O nome deve ter no máximo 100 caracteres.";
  }

  const instanceName = values.instanceName.trim();
  if (instanceName.length === 0) {
    errors.instanceName = "O instanceName é obrigatório.";
  }

  const url = values.evolutionApiUrl.trim();
  if (url.length === 0) {
    errors.evolutionApiUrl = "A URL da EvolutionAPI é obrigatória.";
  } else if (!url.startsWith("http://") && !url.startsWith("https://")) {
    errors.evolutionApiUrl = "A URL deve começar com 'http://' ou 'https://'.";
  }

  const apiKey = values.evolutionApiKey.trim();
  if (apiKey.length === 0) {
    errors.evolutionApiKey = "A chave de API é obrigatória.";
  }

  const prompt = values.systemPrompt;
  if (prompt.length < 10) {
    errors.systemPrompt =
      prompt.length === 0
        ? "O System Prompt é obrigatório."
        : "O System Prompt deve ter pelo menos 10 caracteres.";
  } else if (prompt.length > 5000) {
    errors.systemPrompt = "O System Prompt deve ter no máximo 5000 caracteres.";
  }

  const ds = values.delaySeconds;
  if (!Number.isInteger(ds) || ds < 1 || ds > 60) {
    errors.delaySeconds = "O delay deve ser um inteiro entre 1 e 60.";
  }

  const mms = values.maxMessagesPerSession;
  if (!Number.isInteger(mms) || mms < 1 || mms > 500) {
    errors.maxMessagesPerSession =
      "O máximo de mensagens deve ser um inteiro entre 1 e 500.";
  }

  return errors;
}

function hasErrors(errors: FieldErrors): boolean {
  return Object.values(errors).some((v) => v !== undefined);
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

const DEFAULT_VALUES: AgentFormValues = {
  name: "",
  description: "",
  instanceName: "",
  evolutionApiUrl: "",
  evolutionApiKey: "",
  systemPrompt: "",
  delaySeconds: 3,
  maxMessagesPerSession: 50,
};

function mergeDefaults(
  initial?: Partial<AgentFormValues>,
): AgentFormValues {
  return { ...DEFAULT_VALUES, ...initial };
}

// ─────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-xs text-red-600 mt-1">
      {message}
    </p>
  );
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export function AgentForm({
  initialValues,
  onSuccess,
  onCancel,
  agentId,
}: AgentFormProps) {
  const isEditMode = Boolean(agentId);

  const [values, setValues] = useState<AgentFormValues>(() =>
    mergeDefaults(initialValues),
  );
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [instanceNameConflictError, setInstanceNameConflictError] = useState<
    string | null
  >(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  // Track which fields have been touched (to show errors eagerly after blur)
  const [touched, setTouched] = useState<Partial<Record<keyof AgentFormValues, boolean>>>({});

  // ── Field helpers ────────────────────────────────────────────────────────

  function handleChange<K extends keyof AgentFormValues>(
    field: K,
    value: AgentFormValues[K],
  ) {
    setValues((prev) => ({ ...prev, [field]: value }));
    // Clear conflict error when instanceName changes
    if (field === "instanceName") {
      setInstanceNameConflictError(null);
    }
    // Re-validate the single field when it changes (if already touched)
    if (touched[field]) {
      const updated = { ...values, [field]: value };
      const errors = validate(updated);
      setFieldErrors((prev) => ({
        ...prev,
        [field]: errors[field as keyof FieldErrors],
      }));
    }
  }

  function handleBlur(field: keyof AgentFormValues) {
    setTouched((prev) => ({ ...prev, [field]: true }));
    const errors = validate(values);
    setFieldErrors((prev) => ({
      ...prev,
      [field]: errors[field as keyof FieldErrors],
    }));
  }

  // ── Submission ───────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Mark all fields as touched and run full validation
    setTouched({
      name: true,
      instanceName: true,
      evolutionApiUrl: true,
      evolutionApiKey: true,
      systemPrompt: true,
      delaySeconds: true,
      maxMessagesPerSession: true,
    });
    const errors = validate(values);
    setFieldErrors(errors);

    if (hasErrors(errors)) return;

    setSubmitError(null);
    setInstanceNameConflictError(null);
    setIsLoading(true);

    try {
      const url = isEditMode
        ? `/api/whatsapp-agents/${agentId}`
        : "/api/whatsapp-agents";
      const method = isEditMode ? "PATCH" : "POST";

      const body: Record<string, unknown> = {
        name: values.name.trim(),
        description: values.description.trim() || undefined,
        instanceName: values.instanceName.trim(),
        evolutionApiUrl: values.evolutionApiUrl.trim(),
        evolutionApiKey: values.evolutionApiKey,
        systemPrompt: values.systemPrompt,
        delaySeconds: values.delaySeconds,
        maxMessagesPerSession: values.maxMessagesPerSession,
      };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = (await res.json()) as {
        error?: string;
        field?: string;
        id?: string;
      } & Partial<AgentFormValues>;

      if (!res.ok) {
        // 409 Conflict on instanceName
        if (res.status === 409) {
          setInstanceNameConflictError(
            data.error ?? "Este instanceName já está em uso nesta empresa.",
          );
          return;
        }
        // 400 Validation error — surface as general submit error
        setSubmitError(
          data.error ?? "Ocorreu um erro ao salvar o agente. Tente novamente.",
        );
        return;
      }

      // Success
      onSuccess({ ...values, id: data.id ?? "" });
    } catch {
      setSubmitError(
        "Erro de conexão. Verifique sua internet e tente novamente.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  const systemPromptCharCount = values.systemPrompt.length;
  const systemPromptOverLimit = systemPromptCharCount > 5000;

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {/* ── Name ── */}
      <div className="space-y-1.5">
        <Label htmlFor="agent-name">
          Nome <span aria-hidden="true" className="text-red-500">*</span>
        </Label>
        <p className="text-xs text-gray-500">
          Identificação interna do agente, visível apenas no dashboard.
        </p>
        <Input
          id="agent-name"
          placeholder="Atendente virtual"
          value={values.name}
          onChange={(e) => handleChange("name", e.target.value)}
          onBlur={() => handleBlur("name")}
          disabled={isLoading}
          aria-invalid={Boolean(fieldErrors.name)}
          aria-describedby={fieldErrors.name ? "agent-name-error" : undefined}
          autoComplete="off"
          maxLength={101}
        />
        <FieldError message={fieldErrors.name} />
      </div>

      {/* ── Description (optional) ── */}
      <div className="space-y-1.5">
        <Label htmlFor="agent-description">Descrição (opcional)</Label>
        <Input
          id="agent-description"
          placeholder="Breve descrição do propósito do agente"
          value={values.description}
          onChange={(e) => handleChange("description", e.target.value)}
          disabled={isLoading}
          autoComplete="off"
        />
      </div>

      {/* ── instanceName ── */}
      <div className="space-y-1.5">
        <Label htmlFor="agent-instance-name">
          Instance Name <span aria-hidden="true" className="text-red-500">*</span>
        </Label>
        <p className="text-xs text-gray-500">
          Nome exato da instância criada na sua EvolutionAPI. Deve corresponder ao campo <code className="bg-gray-100 px-1 rounded text-gray-700">instanceName</code> configurado lá. Não pode ser alterado após a criação.
        </p>
        <Input
          id="agent-instance-name"
          placeholder="minha-instancia"
          value={values.instanceName}
          onChange={(e) => handleChange("instanceName", e.target.value)}
          onBlur={() => handleBlur("instanceName")}
          disabled={isLoading}
          aria-invalid={Boolean(fieldErrors.instanceName || instanceNameConflictError)}
          aria-describedby={
            fieldErrors.instanceName
              ? "agent-instance-name-error"
              : instanceNameConflictError
                ? "agent-instance-name-conflict-error"
                : undefined
          }
          autoComplete="off"
        />
        {fieldErrors.instanceName && (
          <p id="agent-instance-name-error" role="alert" className="text-xs text-red-600 mt-1">
            {fieldErrors.instanceName}
          </p>
        )}
        {instanceNameConflictError && !fieldErrors.instanceName && (
          <p id="agent-instance-name-conflict-error" role="alert" className="text-xs text-red-600 mt-1">
            {instanceNameConflictError}
          </p>
        )}
      </div>

      {/* ── Evolution API URL ── */}
      <div className="space-y-1.5">
        <Label htmlFor="agent-evolution-url">
          Evolution API URL <span aria-hidden="true" className="text-red-500">*</span>
        </Label>
        <p className="text-xs text-gray-500">
          Endereço do servidor onde a EvolutionAPI está instalada. Ex: <code className="bg-gray-100 px-1 rounded text-gray-700">https://evolution.suaempresa.com</code>
        </p>
        <Input
          id="agent-evolution-url"
          type="url"
          placeholder="https://evolution.exemplo.com.br"
          value={values.evolutionApiUrl}
          onChange={(e) => handleChange("evolutionApiUrl", e.target.value)}
          onBlur={() => handleBlur("evolutionApiUrl")}
          disabled={isLoading}
          aria-invalid={Boolean(fieldErrors.evolutionApiUrl)}
          aria-describedby={
            fieldErrors.evolutionApiUrl ? "agent-evolution-url-error" : undefined
          }
          autoComplete="off"
        />
        <FieldError message={fieldErrors.evolutionApiUrl} />
      </div>

      {/* ── Evolution API Key ── */}
      <div className="space-y-1.5">
        <Label htmlFor="agent-evolution-key">
          Evolution API Key <span aria-hidden="true" className="text-red-500">*</span>
        </Label>
        <p className="text-xs text-gray-500">
          Chave de autenticação da EvolutionAPI. Encontre-a nas configurações da instância ou no arquivo <code className="bg-gray-100 px-1 rounded text-gray-700">.env</code> do servidor.
        </p>
        <Input
          id="agent-evolution-key"
          type="password"
          placeholder="••••••••••••••••"
          value={values.evolutionApiKey}
          onChange={(e) => handleChange("evolutionApiKey", e.target.value)}
          onBlur={() => handleBlur("evolutionApiKey")}
          disabled={isLoading}
          aria-invalid={Boolean(fieldErrors.evolutionApiKey)}
          aria-describedby={
            fieldErrors.evolutionApiKey ? "agent-evolution-key-error" : undefined
          }
          autoComplete="new-password"
        />
        <FieldError message={fieldErrors.evolutionApiKey} />
      </div>

      {/* ── System Prompt ── */}
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <Label htmlFor="agent-system-prompt">
            System Prompt <span aria-hidden="true" className="text-red-500">*</span>
          </Label>
          <span
            className={`text-xs tabular-nums ${systemPromptOverLimit ? "text-red-600 font-semibold" : "text-gray-400"}`}
            aria-live="polite"
          >
            {systemPromptCharCount}/5000
          </span>
        </div>
        <p className="text-xs text-gray-500">
          Instruções que definem o comportamento e personalidade do agente. Descreva como ele deve responder, o tom de voz e quaisquer regras específicas do seu negócio. Use <code className="bg-gray-100 px-1 rounded text-gray-700">{"{{agentName}}"}</code> para inserir o nome do agente e <code className="bg-gray-100 px-1 rounded text-gray-700">{"{{today}}"}</code> para a data atual.
        </p>
        <textarea
          id="agent-system-prompt"
          rows={6}
          placeholder="Você é um assistente virtual chamado {{agentName}}. Hoje é {{today}}."
          value={values.systemPrompt}
          onChange={(e) => handleChange("systemPrompt", e.target.value)}
          onBlur={() => handleBlur("systemPrompt")}
          disabled={isLoading}
          aria-invalid={Boolean(fieldErrors.systemPrompt)}
          aria-describedby={
            fieldErrors.systemPrompt ? "agent-system-prompt-error" : undefined
          }
          className={`flex w-full rounded-lg border bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:border-transparent disabled:cursor-not-allowed disabled:opacity-50 resize-y min-h-[120px] ${
            fieldErrors.systemPrompt
              ? "border-red-400 focus-visible:ring-red-500"
              : "border-gray-200"
          }`}
        />
        {fieldErrors.systemPrompt && (
          <p id="agent-system-prompt-error" role="alert" className="text-xs text-red-600 mt-1">
            {fieldErrors.systemPrompt}
          </p>
        )}
      </div>

      {/* ── Delay (seconds) ── */}
      <div className="space-y-1.5">
        <Label htmlFor="agent-delay-seconds">
          Delay entre mensagens (segundos)
        </Label>
        <p className="text-xs text-gray-500">
          Pausa em segundos entre o envio de cada parte da resposta (1–60). Padrão: 3.
        </p>
        <Input
          id="agent-delay-seconds"
          type="number"
          min={1}
          max={60}
          step={1}
          value={values.delaySeconds}
          onChange={(e) =>
            handleChange("delaySeconds", parseInt(e.target.value, 10) || 0)
          }
          onBlur={() => handleBlur("delaySeconds")}
          disabled={isLoading}
          aria-invalid={Boolean(fieldErrors.delaySeconds)}
          aria-describedby={
            fieldErrors.delaySeconds ? "agent-delay-seconds-error" : undefined
          }
          className="max-w-[140px]"
        />
        <FieldError message={fieldErrors.delaySeconds} />
      </div>

      {/* ── Max Messages Per Session ── */}
      <div className="space-y-1.5">
        <Label htmlFor="agent-max-messages">
          Máximo de mensagens por sessão (diário)
        </Label>
        <p className="text-xs text-gray-500">
          Número máximo de mensagens trocadas com um contato por dia (1–500). Padrão: 50.
        </p>
        <Input
          id="agent-max-messages"
          type="number"
          min={1}
          max={500}
          step={1}
          value={values.maxMessagesPerSession}
          onChange={(e) =>
            handleChange(
              "maxMessagesPerSession",
              parseInt(e.target.value, 10) || 0,
            )
          }
          onBlur={() => handleBlur("maxMessagesPerSession")}
          disabled={isLoading}
          aria-invalid={Boolean(fieldErrors.maxMessagesPerSession)}
          aria-describedby={
            fieldErrors.maxMessagesPerSession
              ? "agent-max-messages-error"
              : undefined
          }
          className="max-w-[140px]"
        />
        <FieldError message={fieldErrors.maxMessagesPerSession} />
      </div>

      {/* ── Global submit error ── */}
      {submitError && (
        <p
          role="alert"
          className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2"
        >
          {submitError}
        </p>
      )}

      {/* ── Actions ── */}
      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" disabled={isLoading} className="min-w-[120px]">
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {isEditMode ? "Salvando…" : "Criando…"}
            </>
          ) : isEditMode ? (
            "Salvar alterações"
          ) : (
            "Criar agente"
          )}
        </Button>

        {onCancel && (
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isLoading}
          >
            Cancelar
          </Button>
        )}
      </div>
    </form>
  );
}
