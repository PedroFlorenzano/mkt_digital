"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  MessageSquare,
  Loader2,
  AlertCircle,
  ChevronRight,
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
  Mic,
  User,
  Bot,
  ArrowLeft,
} from "lucide-react";
import { DashboardLayout } from "@client/components/layout/dashboard-layout";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ConversationSummary {
  remoteJid: string;
  contactName?: string;
  lastMessage: string;
  lastMessageAt: string;
  messageType?: string;
}

interface KBMessage {
  id: string;
  remoteJid: string;
  contactName?: string;
  role: string;
  content: string;
  messageType: string;
  createdAt: string;
}

interface PaginatedConversations {
  conversations: ConversationSummary[];
  total: number;
  page: number;
  pageSize: number;
}

const PAGE_SIZE = 20;

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "…";
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function KBConversationsPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const kbId = params.id;

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Selected conversation
  const [selectedJid, setSelectedJid] = useState<string | null>(null);
  const [selectedContact, setSelectedContact] = useState<string | null>(null);
  const [messages, setMessages] = useState<KBMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);

  useEffect(() => {
    fetchConversations(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kbId]);

  async function fetchConversations(p: number) {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch(`/api/knowledge-bases/${kbId}/conversations?page=${p}`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error ?? "Falha ao carregar conversas.");
      }
      const data: PaginatedConversations = await res.json();
      // Support both array response and paginated object
      if (Array.isArray(data)) {
        setConversations(data as ConversationSummary[]);
        setTotal((data as ConversationSummary[]).length);
      } else {
        setConversations(data.conversations ?? []);
        setTotal(data.total ?? 0);
      }
      setPage(p);
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : "Erro desconhecido.");
    } finally {
      setLoading(false);
    }
  }

  async function fetchMessages(remoteJid: string, contactName?: string) {
    setSelectedJid(remoteJid);
    setSelectedContact(contactName ?? remoteJid);
    setMessagesLoading(true);
    setMessagesError(null);
    try {
      const encoded = encodeURIComponent(remoteJid);
      const res = await fetch(`/api/knowledge-bases/${kbId}/conversations/${encoded}`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error ?? "Falha ao carregar mensagens.");
      }
      const data = await res.json();
      setMessages(Array.isArray(data) ? data : data.messages ?? []);
    } catch (e) {
      setMessagesError(e instanceof Error ? e.message : "Erro desconhecido.");
    } finally {
      setMessagesLoading(false);
    }
  }

  function closeConversation() {
    setSelectedJid(null);
    setSelectedContact(null);
    setMessages([]);
    setMessagesError(null);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <DashboardLayout>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        <button onClick={() => router.push("/knowledge-base")} className="hover:text-gray-700">Base de Conhecimento</button>
        <ChevronRight className="h-4 w-4" />
        <button onClick={() => router.push(`/knowledge-base/${kbId}`)} className="hover:text-gray-700">Detalhes</button>
        <ChevronRight className="h-4 w-4" />
        <span className="text-gray-900 font-medium">Conversas</span>
      </div>

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50">
          <MessageSquare className="h-5 w-5 text-blue-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Conversas</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {selectedJid ? `Histórico: ${selectedContact ?? selectedJid}` : `${total} conversa(s) registrada(s)`}
          </p>
        </div>
      </div>

      {/* Conversation Detail View */}
      {selectedJid ? (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          {/* Detail Header */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 bg-gray-50">
            <button
              onClick={closeConversation}
              className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </button>
            <div className="h-4 w-px bg-gray-300" />
            <div>
              <p className="font-semibold text-gray-900 text-sm">{selectedContact ?? selectedJid}</p>
              {selectedContact !== selectedJid && (
                <p className="text-xs text-gray-400 font-mono">{selectedJid}</p>
              )}
            </div>
          </div>

          {/* Messages */}
          <div className="p-5 space-y-4 max-h-[600px] overflow-y-auto">
            {messagesLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
              </div>
            ) : messagesError ? (
              <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                {messagesError}
              </div>
            ) : messages.length === 0 ? (
              <p className="text-center text-sm text-gray-400 py-8">Nenhuma mensagem nesta conversa.</p>
            ) : (
              messages.map((msg) => {
                const isUser = msg.role === "user";
                const isAudio = msg.messageType === "audio";
                return (
                  <div
                    key={msg.id}
                    className={`flex gap-3 ${isUser ? "flex-row" : "flex-row-reverse"}`}
                  >
                    {/* Avatar */}
                    <div className={`flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center ${isUser ? "bg-gray-100" : "bg-blue-100"}`}>
                      {isUser ? (
                        <User className="h-4 w-4 text-gray-600" />
                      ) : (
                        <Bot className="h-4 w-4 text-blue-600" />
                      )}
                    </div>

                    {/* Bubble */}
                    <div className={`max-w-[70%] ${isUser ? "" : "items-end"} flex flex-col gap-1`}>
                      <div className={`flex items-center gap-2 ${isUser ? "" : "flex-row-reverse"}`}>
                        <span className="text-xs font-semibold text-gray-500">
                          {isUser ? "Operador" : "Agente"}
                        </span>
                        <span className="text-xs text-gray-400">{formatDateTime(msg.createdAt)}</span>
                      </div>
                      <div className={`rounded-2xl px-4 py-2.5 text-sm ${isUser ? "bg-gray-100 text-gray-800 rounded-tl-sm" : "bg-blue-600 text-white rounded-tr-sm"}`}>
                        {isAudio && (
                          <div className={`flex items-center gap-1.5 mb-1 ${isUser ? "text-gray-500" : "text-blue-200"}`}>
                            <Mic className="h-3.5 w-3.5" />
                            <span className="text-xs font-medium">Mensagem de áudio</span>
                          </div>
                        )}
                        {isAudio && !msg.content ? (
                          <span className={`text-xs italic ${isUser ? "text-gray-400" : "text-blue-200"}`}>
                            Transcrição não disponível
                          </span>
                        ) : (
                          <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : (
        /* Conversations List */
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
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <MessageSquare className="h-10 w-10 text-gray-300 mb-3" />
              <p className="text-gray-500 font-medium">Nenhuma conversa registrada</p>
              <p className="text-sm text-gray-400 mt-1">As conversas aparecerão aqui quando operadores interagirem com o agente.</p>
            </div>
          ) : (
            <>
              <ul className="divide-y divide-gray-50">
                {conversations.map((conv) => (
                  <li key={conv.remoteJid}>
                    <button
                      onClick={() => fetchMessages(conv.remoteJid, conv.contactName)}
                      className="w-full text-left flex items-start gap-3 px-5 py-4 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex-shrink-0 h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center mt-0.5">
                        <User className="h-5 w-5 text-gray-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <span className="font-medium text-gray-900 text-sm truncate">
                            {conv.contactName ?? conv.remoteJid}
                          </span>
                          <span className="flex-shrink-0 text-xs text-gray-400">
                            {formatDateTime(conv.lastMessageAt)}
                          </span>
                        </div>
                        <p className="text-sm text-gray-500 truncate">
                          {conv.messageType === "audio" && (
                            <span className="inline-flex items-center gap-1 mr-1 text-gray-400">
                              <Mic className="h-3 w-3" />
                            </span>
                          )}
                          {truncateText(conv.lastMessage, 100)}
                        </p>
                        {conv.contactName && (
                          <p className="text-xs text-gray-400 font-mono mt-0.5 truncate">{conv.remoteJid}</p>
                        )}
                      </div>
                      <ChevronRightIcon className="flex-shrink-0 h-4 w-4 text-gray-300 mt-3" />
                    </button>
                  </li>
                ))}
              </ul>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3">
                  <p className="text-sm text-gray-500">
                    Página {page} de {totalPages} · {total} conversas
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => fetchConversations(page - 1)}
                      disabled={page <= 1}
                      className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 transition-colors"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Anterior
                    </button>
                    <button
                      onClick={() => fetchConversations(page + 1)}
                      disabled={page >= totalPages}
                      className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40 transition-colors"
                    >
                      Próxima
                      <ChevronRightIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </DashboardLayout>
  );
}
