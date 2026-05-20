"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle, Loader2, AlertCircle, Inbox, ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@client/components/ui/card";
import { Button } from "@client/components/ui/button";
import type { ConversationSummary } from "@server/repositories/conversation.repository";

// ─────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────

interface ConversationListProps {
  agentId: string;
  /**
   * Optional callback invoked when the user selects a conversation.
   * If provided, navigation via router.push is skipped and this callback
   * is called instead with the selected remoteJid.
   */
  onSelect?: (remoteJid: string) => void;
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/**
 * Format a Date (or ISO string) as DD/MM/YYYY HH:mm in the browser locale.
 * Requirement 4.2 shows last message date in this format.
 */
function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const pad = (n: number) => String(n).padStart(2, "0");
  const day = pad(d.getDate());
  const month = pad(d.getMonth() + 1);
  const year = d.getFullYear();
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

/**
 * Displays the list of conversations for a WhatsApp Agent, grouped by
 * remoteJid. Each row shows the contact name (or remoteJid as fallback),
 * the date of the last message and the total message count.
 *
 * Clicking a row navigates to the message history page for that contact
 * (or calls `onSelect` if provided).
 *
 * Requirements: 4.2
 */
export function ConversationList({ agentId, onSelect }: ConversationListProps) {
  const router = useRouter();

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const pageSize = 20;

  useEffect(() => {
    setLoading(true);
    setError(null);

    fetch(`/api/whatsapp-agents/${agentId}/conversations?page=${page}&pageSize=${pageSize}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({})) as { error?: string };
          throw new Error(body.error ?? `Erro ${res.status}`);
        }
        return res.json() as Promise<ConversationSummary[]>;
      })
      .then((data) => {
        setConversations(data);
        // If we got a full page, there might be more
        setHasMore(data.length === pageSize);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Falha ao carregar conversas");
        setLoading(false);
      });
  }, [agentId, page]);

  function handleSelect(remoteJid: string) {
    if (onSelect) {
      onSelect(remoteJid);
    } else {
      router.push(
        `/whatsapp-agent/${agentId}/conversations/${encodeURIComponent(remoteJid)}`
      );
    }
  }

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
          <AlertCircle className="h-8 w-8 text-red-400" />
          <p className="text-sm text-red-600 font-medium">{error}</p>
          <Button variant="outline" size="sm" onClick={() => setPage(1)}>
            Tentar novamente
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ── Empty ────────────────────────────────────────────────────────────────
  if (conversations.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
          <Inbox className="h-10 w-10 text-gray-300" />
          <p className="text-gray-500 font-medium">Nenhuma conversa ainda</p>
          <p className="text-gray-400 text-sm">
            As conversas aparecerão aqui assim que o agente receber mensagens.
          </p>
        </CardContent>
      </Card>
    );
  }

  // ── List ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Contato</th>
              <th className="px-4 py-3 text-left font-semibold text-gray-600">Última mensagem</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-600">Mensagens</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {conversations.map((conv) => (
              <tr
                key={conv.remoteJid}
                className="hover:bg-gray-50 transition-colors cursor-pointer"
                onClick={() => handleSelect(conv.remoteJid)}
              >
                {/* Contact name or remoteJid fallback */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <MessageCircle className="h-4 w-4 text-green-500 shrink-0" />
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 truncate">
                        {conv.contactName ?? conv.remoteJid}
                      </p>
                      {conv.contactName && (
                        <p className="text-xs text-gray-400 truncate">{conv.remoteJid}</p>
                      )}
                    </div>
                  </div>
                </td>

                {/* Last message date — DD/MM/YYYY HH:mm */}
                <td className="px-4 py-3 text-gray-600">
                  {formatDate(conv.lastMessageAt)}
                </td>

                {/* Message count */}
                <td className="px-4 py-3 text-right text-gray-700 font-mono">
                  {conv.messageCount}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {(page > 1 || hasMore) && (
        <div className="flex items-center justify-between text-sm text-gray-600">
          <span>Página {page}</span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              <ChevronLeft className="h-4 w-4" />
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={!hasMore}
            >
              Próxima
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
