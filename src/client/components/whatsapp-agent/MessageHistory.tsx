"use client";

import { cn } from "@server/lib/utils";
import type { MessageRecord } from "@server/repositories/conversation.repository";

interface MessageHistoryProps {
  messages: MessageRecord[];
}

/**
 * Renders the conversation history for a single (agentId, remoteJid) pair.
 *
 * Messages are displayed in ascending chronological order (oldest at top,
 * newest at bottom). User messages are right-aligned with a blue bubble;
 * assistant messages are left-aligned with a white/gray bubble.
 *
 * Requirements: 4.3
 */
export function MessageHistory({ messages }: MessageHistoryProps) {
  if (messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center text-gray-400">
        <p className="text-sm">Nenhuma mensagem encontrada nesta conversa.</p>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col gap-3 px-4 py-4"
      role="log"
      aria-label="Histórico de mensagens"
      aria-live="polite"
    >
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────
// Internal sub-component
// ─────────────────────────────────────────────

interface MessageBubbleProps {
  message: MessageRecord;
}

function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <div
      className={cn(
        "flex w-full",
        isUser ? "justify-end" : "justify-start",
      )}
    >
      <div
        className={cn(
          "max-w-[75%] rounded-2xl px-4 py-2.5 shadow-sm",
          isUser
            ? "rounded-br-sm bg-blue-600 text-white"
            : "rounded-bl-sm border border-gray-100 bg-white text-gray-900",
        )}
      >
        {/* Role label */}
        <p
          className={cn(
            "mb-1 text-xs font-semibold",
            isUser ? "text-blue-100" : "text-gray-400",
          )}
          aria-hidden="true"
        >
          {isUser ? "Usuário" : "Assistente"}
        </p>

        {/* Message content */}
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
          {message.content}
        </p>

        {/* Timestamp */}
        <p
          className={cn(
            "mt-1.5 text-right text-xs",
            isUser ? "text-blue-200" : "text-gray-400",
          )}
          aria-label={`Enviado em ${formatDateTime(message.createdAt)}`}
        >
          {formatDateTime(message.createdAt)}
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function formatDateTime(date: Date): string {
  return new Date(date).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
