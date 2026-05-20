"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  BotMessageSquare,
  Edit2,
  Loader2,
  PauseCircle,
  PlayCircle,
  PlusCircle,
  XCircle,
} from "lucide-react";
import { Badge } from "@client/components/ui/badge";
import { Button } from "@client/components/ui/button";
import { Card, CardContent } from "@client/components/ui/card";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface AgentSummary {
  id: string;
  name: string;
  instanceName: string;
  status: "active" | "paused";
  createdAt: string; // ISO string from JSON serialisation
}

interface AgentListProps {
  /** Called when the user clicks "Create Agent" (empty state or header CTA). */
  onCreateAgent: () => void;
  /** Called when the user clicks the edit button for a specific agent. */
  onEditAgent: (agentId: string) => void;
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

// ─────────────────────────────────────────────
// Toast (inline, no external library)
// ─────────────────────────────────────────────

interface ToastState {
  id: number;
  message: string;
  type: "error" | "success";
}

function useToast() {
  const [toasts, setToasts] = useState<ToastState[]>([]);
  const counterRef = useRef(0);

  function show(message: string, type: "error" | "success" = "error") {
    const id = ++counterRef.current;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }

  function dismiss(id: number) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  return { toasts, show, dismiss };
}

// ─────────────────────────────────────────────
// AgentList component
// ─────────────────────────────────────────────

export function AgentList({ onCreateAgent, onEditAgent }: AgentListProps) {
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  // Track which agents are currently having their status toggled
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());

  const { toasts, show: showToast, dismiss } = useToast();

  // ── Fetch agents on mount ────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    setFetchError(null);

    fetch("/api/whatsapp-agents")
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(body.error ?? `Erro ${res.status}`);
        }
        return res.json() as Promise<AgentSummary[]>;
      })
      .then((data) => {
        setAgents(data);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setFetchError(
          err instanceof Error ? err.message : "Falha ao carregar agentes"
        );
        setLoading(false);
      });
  }, []);

  // ── Toggle status (optimistic) ───────────────────────────────────────────
  async function handleToggleStatus(agent: AgentSummary) {
    if (togglingIds.has(agent.id)) return;

    // Optimistic update
    const previousStatus = agent.status;
    const optimisticStatus: "active" | "paused" =
      agent.status === "active" ? "paused" : "active";

    setAgents((prev) =>
      prev.map((a) =>
        a.id === agent.id ? { ...a, status: optimisticStatus } : a
      )
    );
    setTogglingIds((prev) => new Set(prev).add(agent.id));

    try {
      const res = await fetch(`/api/whatsapp-agents/${agent.id}/status`, {
        method: "PATCH",
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? `Erro ${res.status}`);
      }

      const updated = (await res.json()) as AgentSummary;

      // Replace with server-confirmed state
      setAgents((prev) =>
        prev.map((a) => (a.id === updated.id ? { ...a, status: updated.status } : a))
      );
    } catch (err) {
      // Revert on error
      setAgents((prev) =>
        prev.map((a) =>
          a.id === agent.id ? { ...a, status: previousStatus } : a
        )
      );
      showToast(
        err instanceof Error
          ? err.message
          : "Falha ao alterar o status do agente.",
        "error"
      );
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev);
        next.delete(agent.id);
        return next;
      });
    }
  }

  // ─────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Toast stack */}
      {toasts.length > 0 && (
        <div
          role="alert"
          aria-live="polite"
          className="fixed bottom-6 right-6 z-50 flex flex-col gap-2"
        >
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-md ${
                t.type === "error"
                  ? "border-red-200 bg-red-50 text-red-700"
                  : "border-green-200 bg-green-50 text-green-700"
              }`}
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="flex-1">{t.message}</span>
              <button
                aria-label="Fechar notificação"
                onClick={() => dismiss(t.id)}
                className="ml-2 text-current opacity-60 hover:opacity-100"
              >
                <XCircle className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
        </div>
      )}

      {/* Fetch error */}
      {!loading && fetchError && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
            <AlertCircle className="h-8 w-8 text-red-400" />
            <p className="text-sm text-red-600 font-medium">{fetchError}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setLoading(true);
                setFetchError(null);
                fetch("/api/whatsapp-agents")
                  .then(async (res) => {
                    if (!res.ok) {
                      const body = (await res
                        .json()
                        .catch(() => ({}))) as { error?: string };
                      throw new Error(body.error ?? `Erro ${res.status}`);
                    }
                    return res.json() as Promise<AgentSummary[]>;
                  })
                  .then((data) => {
                    setAgents(data);
                    setLoading(false);
                  })
                  .catch((err: unknown) => {
                    setFetchError(
                      err instanceof Error
                        ? err.message
                        : "Falha ao carregar agentes"
                    );
                    setLoading(false);
                  });
              }}
            >
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {!loading && !fetchError && agents.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-20 gap-4">
            <BotMessageSquare className="h-12 w-12 text-gray-300" />
            <div className="text-center space-y-1">
              <p className="text-gray-700 font-medium">
                Nenhum agente configurado
              </p>
              <p className="text-gray-400 text-sm">
                Configure seu primeiro agente de IA para o WhatsApp.
              </p>
            </div>
            <Button onClick={onCreateAgent} className="gap-2">
              <PlusCircle className="h-4 w-4" />
              Criar primeiro agente
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Agent table */}
      {!loading && !fetchError && agents.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-3 text-left font-semibold text-gray-600">
                  Nome
                </th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">
                  Instance Name
                </th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">
                  Status
                </th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">
                  Criado em
                </th>
                <th className="px-4 py-3 text-right font-semibold text-gray-600">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {agents.map((agent) => {
                const isToggling = togglingIds.has(agent.id);
                return (
                  <tr
                    key={agent.id}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    {/* Name */}
                    <td className="px-4 py-3 font-medium text-gray-900 max-w-xs truncate">
                      {agent.name}
                    </td>

                    {/* Instance name */}
                    <td className="px-4 py-3 text-gray-600 font-mono text-xs">
                      {agent.instanceName}
                    </td>

                    {/* Status badge */}
                    <td className="px-4 py-3">
                      {agent.status === "active" ? (
                        <Badge variant="success">Ativo</Badge>
                      ) : (
                        <Badge variant="warning">Pausado</Badge>
                      )}
                    </td>

                    {/* Created at */}
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                      {formatDate(agent.createdAt)}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {/* Edit */}
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Editar agente ${agent.name}`}
                          onClick={() => onEditAgent(agent.id)}
                          title="Editar agente"
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>

                        {/* Toggle status */}
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={
                            agent.status === "active"
                              ? `Pausar agente ${agent.name}`
                              : `Ativar agente ${agent.name}`
                          }
                          onClick={() => void handleToggleStatus(agent)}
                          disabled={isToggling}
                          title={
                            agent.status === "active"
                              ? "Pausar agente"
                              : "Ativar agente"
                          }
                        >
                          {isToggling ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : agent.status === "active" ? (
                            <PauseCircle className="h-4 w-4 text-orange-500" />
                          ) : (
                            <PlayCircle className="h-4 w-4 text-green-600" />
                          )}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
