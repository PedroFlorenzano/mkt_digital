import { prisma } from "@server/lib/prisma";
import type { WhatsAppMessage } from "@prisma/client";

// ─────────────────────────────────────────────
// Input / output types
// ─────────────────────────────────────────────

export interface SaveMessageData {
  agentId: string;
  remoteJid: string;
  contactName?: string | null;
  role: "user" | "assistant";
  content: string;
}

export interface MessageRecord {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
}

export interface ConversationSummary {
  remoteJid: string;
  contactName: string | null;
  lastMessageAt: Date;
  messageCount: number;
}

// ─────────────────────────────────────────────
// Repository
// ─────────────────────────────────────────────

export const conversationRepository = {
  /**
   * Persists a single message (user or assistant) in the database.
   *
   * Post-conditions:
   *   - Returns the created WhatsAppMessage with generated id and createdAt
   *   - message.agentId === input.agentId
   *   - message.remoteJid === input.remoteJid
   *   - message.role === input.role
   *   - message.content === input.content
   *
   * Requirements: 4.1, 6.2
   */
  save(data: SaveMessageData): Promise<WhatsAppMessage> {
    return prisma.whatsAppMessage.create({ data });
  },

  /**
   * Returns all messages for a given (agentId, remoteJid) pair in ascending
   * createdAt order — the format expected by the Bedrock conversation history
   * and the UI message-history view.
   *
   * Post-conditions:
   *   - Every returned record belongs to (agentId, remoteJid)
   *   - Records are ordered by createdAt ASC (strictly ascending)
   *   - role is cast to the union type for type safety
   *
   * Requirements: 4.3, 4.4, 6.6
   */
  getHistory(agentId: string, remoteJid: string): Promise<MessageRecord[]> {
    return prisma.whatsAppMessage.findMany({
      where: { agentId, remoteJid },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        role: true,
        content: true,
        createdAt: true,
      },
    }) as Promise<MessageRecord[]>;
  },

  /**
   * Returns a paginated list of conversations for an agent, grouped by
   * remoteJid and sorted by the most-recent message timestamp descending.
   *
   * Because SQLite (via Prisma) does not support `groupBy` with aggregate
   * ordering in a single query, we use `findMany` with a raw-group simulation:
   * fetch the latest message per remoteJid using Prisma's groupBy aggregate.
   *
   * Post-conditions:
   *   - Returns exactly one entry per distinct remoteJid active for agentId
   *   - Each entry carries the correct contactName (last known), last message
   *     timestamp, and total message count for that remoteJid
   *   - Results are ordered by lastMessageAt DESC
   *   - Pagination via page (1-based) and pageSize
   *
   * Requirements: 4.2, 6.4
   */
  async listConversations(
    agentId: string,
    page = 1,
    pageSize = 20,
  ): Promise<ConversationSummary[]> {
    // Step 1: group by remoteJid to get max(createdAt) and count
    const groups = await prisma.whatsAppMessage.groupBy({
      by: ["remoteJid"],
      where: { agentId },
      _max: { createdAt: true },
      _count: { id: true },
      orderBy: { _max: { createdAt: "desc" } },
      take: pageSize,
      skip: (page - 1) * pageSize,
    });

    if (groups.length === 0) return [];

    // Step 2: for each remoteJid, find the latest message to retrieve contactName
    const summaries: ConversationSummary[] = await Promise.all(
      groups.map(async (group) => {
        const lastMessage = await prisma.whatsAppMessage.findFirst({
          where: { agentId, remoteJid: group.remoteJid },
          orderBy: { createdAt: "desc" },
          select: { contactName: true, createdAt: true },
        });

        return {
          remoteJid: group.remoteJid,
          contactName: lastMessage?.contactName ?? null,
          lastMessageAt: group._max.createdAt as Date,
          messageCount: group._count.id,
        };
      }),
    );

    return summaries;
  },

  /**
   * Counts messages exchanged between a specific remoteJid and an agent
   * during the current UTC calendar day (midnight UTC → now).
   *
   * Used by the webhook handler to enforce the `maxMessagesPerSession` limit
   * per day boundary (UTC).
   *
   * Post-conditions:
   *   - Returns integer ≥ 0
   *   - Only counts messages whose createdAt ≥ start of today in UTC
   *
   * Requirements: 3.15, 6.6
   */
  countTodayMessages(agentId: string, remoteJid: string): Promise<number> {
    const now = new Date();
    const startOfDayUtc = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );

    return prisma.whatsAppMessage.count({
      where: {
        agentId,
        remoteJid,
        createdAt: { gte: startOfDayUtc },
      },
    });
  },
};
