import {
  conversationRepository,
  type SaveMessageData,
  type MessageRecord,
  type ConversationSummary,
} from "@server/repositories/conversation.repository";
import type { WhatsAppMessage } from "@prisma/client";

// ─────────────────────────────────────────────
// Input types (re-exported for consumers)
// ─────────────────────────────────────────────

export type SaveMessageInput = SaveMessageData;
export type { MessageRecord, ConversationSummary };

// ─────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────

/**
 * ConversationService — thin orchestration layer over conversationRepository.
 *
 * Responsibilities:
 *   - Persist individual messages (user or assistant) via `saveMessage`
 *   - Retrieve conversation history for a remoteJid in ascending chronological
 *     order via `getHistory` (used by the webhook handler and the UI)
 *   - List all conversations for an agent, paginated and sorted by most-recent
 *     message descending, via `listConversations`
 *   - Count today's messages for a (agentId, remoteJid) pair via
 *     `countTodayMessages` to enforce the daily session limit
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 6.2, 6.4, 6.6
 */
export const conversationService = {
  /**
   * Persists a single message (user or assistant) in the database.
   *
   * Post-conditions:
   *   - Returns the created WhatsAppMessage with generated id and createdAt
   *   - Stored record has agentId, remoteJid, role, and content matching input
   *
   * Requirements: 4.1, 6.2
   */
  saveMessage(input: SaveMessageInput): Promise<WhatsAppMessage> {
    return conversationRepository.save(input);
  },

  /**
   * Returns all messages for a (agentId, remoteJid) pair sorted ascending by
   * createdAt — the format expected by the Bedrock conversation history and
   * the UI message-history view.
   *
   * Post-conditions:
   *   - Every returned record belongs to the given (agentId, remoteJid)
   *   - Records are ordered by createdAt ASC (strictly ascending)
   *
   * Requirements: 4.3, 4.4, 6.6
   */
  getHistory(agentId: string, remoteJid: string): Promise<MessageRecord[]> {
    return conversationRepository.getHistory(agentId, remoteJid);
  },

  /**
   * Returns a paginated list of conversations for an agent grouped by
   * remoteJid, sorted by the most-recent message timestamp descending.
   *
   * Post-conditions:
   *   - Returns exactly one entry per distinct remoteJid active for agentId
   *   - Each entry contains contactName, lastMessageAt, and messageCount
   *   - Results are ordered by lastMessageAt DESC
   *   - Pagination via page (1-based) and pageSize
   *
   * Requirements: 4.2, 6.4
   */
  listConversations(
    agentId: string,
    page = 1,
    pageSize = 20,
  ): Promise<ConversationSummary[]> {
    return conversationRepository.listConversations(agentId, page, pageSize);
  },

  /**
   * Counts messages exchanged between a specific remoteJid and an agent
   * during the current UTC calendar day.
   *
   * Used by the webhook handler to enforce the `maxMessagesPerSession` daily
   * limit.
   *
   * Post-conditions:
   *   - Returns integer ≥ 0
   *   - Only counts messages whose createdAt ≥ start of today in UTC
   *
   * Requirements: 3.15, 6.6
   */
  countTodayMessages(agentId: string, remoteJid: string): Promise<number> {
    return conversationRepository.countTodayMessages(agentId, remoteJid);
  },
};
