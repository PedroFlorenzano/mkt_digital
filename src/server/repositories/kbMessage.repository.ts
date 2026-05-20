import { prisma } from "@server/lib/prisma";
import type { KBMessage } from "@prisma/client";

// ─────────────────────────────────────────────
// Input / output types
// ─────────────────────────────────────────────

export interface SaveKBMessageData {
  agentId: string;
  remoteJid: string;
  contactName?: string | null;
  role: "user" | "assistant";
  content: string;
  messageType: "text" | "audio";
}

export interface KBConversationSummary {
  remoteJid: string;
  contactName: string | null;
  lastMessageAt: Date;
  lastMessagePreview: string;
  messageCount: number;
}

// ─────────────────────────────────────────────
// Repository
// ─────────────────────────────────────────────

export const kbMessageRepository = {
  /**
   * Persists a single KBMessage (user or assistant) in the database.
   *
   * Post-conditions:
   *   - Returns the created KBMessage with generated id and createdAt
   *   - message.agentId === input.agentId
   *   - message.remoteJid === input.remoteJid
   *   - message.role === input.role
   *   - message.content === input.content
   *   - message.messageType === input.messageType
   *
   * Requirements: 5.4, 6.2
   */
  save(data: SaveKBMessageData): Promise<KBMessage> {
    return prisma.kBMessage.create({ data });
  },

  /**
   * Returns the last `limit` messages for a given (agentId, remoteJid) pair
   * in ascending createdAt order (chronological).
   *
   * Implementation: fetches the last N messages ordered desc, then reverses
   * the array so the result is in ascending (chronological) order — the
   * format expected by the Bedrock conversation history and the UI.
   *
   * Post-conditions:
   *   - Every returned record belongs to (agentId, remoteJid)
   *   - Returns at most `limit` messages
   *   - Records are ordered by createdAt ASC (strictly ascending)
   *
   * Requirements: 5.5, 6.3, 8.2
   */
  async getHistory(
    agentId: string,
    remoteJid: string,
    limit = 20,
  ): Promise<KBMessage[]> {
    const messages = await prisma.kBMessage.findMany({
      where: { agentId, remoteJid },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    // Reverse to get chronological (ascending) order
    return messages.reverse();
  },

  /**
   * Returns a paginated list of conversations for an agent, grouped by
   * remoteJid and sorted by the most-recent message timestamp descending.
   *
   * Uses Prisma's groupBy to aggregate, then fetches the last message per
   * remoteJid to get contactName and lastMessagePreview (last 100 chars of
   * the last message content).
   *
   * Post-conditions:
   *   - Returns exactly one entry per distinct remoteJid active for agentId
   *   - Each entry carries the correct contactName (last known), last message
   *     timestamp, lastMessagePreview (last 100 chars), and total message
   *     count for that remoteJid
   *   - Results are ordered by lastMessageAt DESC
   *   - Pagination via page (1-based) and pageSize
   *
   * Requirements: 8.1, 8.5
   */
  async listConversations(
    agentId: string,
    page = 1,
    pageSize = 20,
  ): Promise<KBConversationSummary[]> {
    // Step 1: group by remoteJid to get max(createdAt) and count
    const groups = await prisma.kBMessage.groupBy({
      by: ["remoteJid"],
      where: { agentId },
      _max: { createdAt: true },
      _count: { id: true },
      orderBy: { _max: { createdAt: "desc" } },
      take: pageSize,
      skip: (page - 1) * pageSize,
    });

    if (groups.length === 0) return [];

    // Step 2: for each remoteJid, find the latest message to retrieve
    // contactName and content for the preview
    const summaries: KBConversationSummary[] = await Promise.all(
      groups.map(async (group) => {
        const lastMessage = await prisma.kBMessage.findFirst({
          where: { agentId, remoteJid: group.remoteJid },
          orderBy: { createdAt: "desc" },
          select: { contactName: true, createdAt: true, content: true },
        });

        const content = lastMessage?.content ?? "";
        // Take the last 100 characters of the content as the preview
        const lastMessagePreview = content.length > 100
          ? content.slice(-100)
          : content;

        return {
          remoteJid: group.remoteJid,
          contactName: lastMessage?.contactName ?? null,
          lastMessageAt: group._max.createdAt as Date,
          lastMessagePreview,
          messageCount: group._count.id,
        };
      }),
    );

    return summaries;
  },

  /**
   * Counts KBMessages with `role = "user"` for a specific (agentId, remoteJid)
   * pair within the current UTC calendar day (00:00:00 UTC → 23:59:59 UTC).
   *
   * Used by the webhook handler to enforce the `maxMessagesPerDay` limit.
   *
   * Post-conditions:
   *   - Returns integer ≥ 0
   *   - Only counts messages with role = "user"
   *   - Only counts messages whose createdAt ≥ start of today in UTC
   *
   * Requirements: 5.3, 9.4
   */
  countTodayUserMessages(agentId: string, remoteJid: string): Promise<number> {
    const now = new Date();
    const startOfDayUtc = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );

    return prisma.kBMessage.count({
      where: {
        agentId,
        remoteJid,
        role: "user",
        createdAt: { gte: startOfDayUtc },
      },
    });
  },
};
