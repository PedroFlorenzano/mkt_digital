"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, MessageSquare, Loader2, AlertCircle } from "lucide-react";
import { DashboardLayout } from "@client/components/layout/dashboard-layout";
import { ConversationList } from "@client/components/whatsapp-agent/ConversationList";
import { MessageHistory } from "@client/components/whatsapp-agent/MessageHistory";
import { Button } from "@client/components/ui/button";
import { Card, CardContent } from "@client/components/ui/card";
import type { MessageRecord } from "@server/repositories/conversation.repository";

// ─────────────────────────────────────────────
// Message pane — fetches and renders messages for a selected remoteJid
// ─────────────────────────────────────────────

interface MessagePaneProps {
  agentId: string;
  remoteJid: string;
}

function MessagePane({ agentId, remoteJid }: MessagePaneProps) {
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    fetch(
      `/api/whatsapp-agents/${agentId}/conversations/${encodeURIComponent(remoteJid)}`
    )
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(body.error ?? `Erro ${res.status}`);
        }
        return res.json() as Promise<MessageRecord[]>;
      })
      .then((data) => {
        setMessages(data);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(
          err instanceof Error ? err.message : "Falha ao carregar mensagens"
        );
        setLoading(false);
      });
  }, [agentId, remoteJid]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
          <AlertCircle className="h-8 w-8 text-red-400" />
          <p className="text-sm text-red-600 font-medium">{error}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setLoading(true);
              setError(null);
              fetch(
                `/api/whatsapp-agents/${agentId}/conversations/${encodeURIComponent(remoteJid)}`
              )
                .then((r) => r.json())
                .then((data: MessageRecord[]) => {
                  setMessages(data);
                  setLoading(false);
                })
                .catch(() => {
                  setError("Falha ao carregar mensagens");
                  setLoading(false);
                });
            }}
          >
            Tentar novamente
          </Button>
        </CardContent>
      </Card>
    );
  }

  return <MessageHistory messages={messages} />;
}

// ─────────────────────────────────────────────
// Conversations page
// ─────────────────────────────────────────────

/**
 * Conversations page for a WhatsApp Agent.
 *
 * Left panel: ConversationList — lists all conversations grouped by remoteJid.
 * Right panel: MessageHistory — shows messages for the selected conversation.
 *
 * When a conversation is selected in the list the remoteJid is kept in local
 * state and the right panel fetches and renders the corresponding messages.
 *
 * Layout: side-by-side on md+ screens, stacked on mobile.
 *
 * Requirements: 4.2, 4.3
 */
export default function ConversationsPage() {
  const params = useParams();
  const agentId = params.id as string;

  const [selectedRemoteJid, setSelectedRemoteJid] = useState<string | null>(
    null
  );

  return (
    <DashboardLayout>
      {/* ── Header ── */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="outline" size="sm" asChild>
          <Link href={`/whatsapp-agent/${agentId}`}>
            <ArrowLeft className="h-4 w-4" />
            Voltar ao Agente
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-green-50">
            <MessageSquare className="h-5 w-5 text-green-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Conversas</h1>
            <p className="text-sm text-gray-500">
              Histórico de mensagens do agente
            </p>
          </div>
        </div>
      </div>

      {/* ── Main layout: list (left) + history (right) ── */}
      <div className="flex flex-col md:flex-row gap-6 min-h-[600px]">
        {/* Conversation list panel */}
        <div
          className={
            selectedRemoteJid
              ? "w-full md:w-80 lg:w-96 shrink-0"
              : "w-full"
          }
        >
          <ConversationList
            agentId={agentId}
            onSelect={(remoteJid) => setSelectedRemoteJid(remoteJid)}
          />
        </div>

        {/* Message history panel */}
        {selectedRemoteJid && (
          <div className="flex-1 min-w-0 rounded-xl border border-gray-100 bg-white shadow-sm overflow-y-auto max-h-[calc(100vh-220px)]">
            {/* Panel header showing selected contact */}
            <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-gray-100 bg-white px-4 py-3">
              <div className="flex items-center gap-2 min-w-0">
                <MessageSquare className="h-4 w-4 text-green-500 shrink-0" />
                <span className="text-sm font-medium text-gray-900 truncate">
                  {selectedRemoteJid}
                </span>
              </div>
              <button
                onClick={() => setSelectedRemoteJid(null)}
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors shrink-0"
                aria-label="Fechar conversa"
              >
                Fechar
              </button>
            </div>

            <MessagePane agentId={agentId} remoteJid={selectedRemoteJid} />
          </div>
        )}

        {/* Placeholder when no conversation is selected (side-by-side layout) */}
        {!selectedRemoteJid && (
          <div className="hidden md:flex flex-1 items-center justify-center rounded-xl border border-dashed border-gray-200 bg-gray-50">
            <div className="flex flex-col items-center gap-2 text-gray-400 p-8 text-center">
              <MessageSquare className="h-10 w-10 text-gray-200" />
              <p className="text-sm font-medium">
                Selecione uma conversa para ver as mensagens
              </p>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
