import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@server/lib/auth";
import { kbAgentService } from "@server/services/kbAgent.service";
import { kbMessageRepository } from "@server/repositories/kbMessage.repository";
import { withErrorHandler } from "@server/lib/api-handler";
import { UnauthorizedError, NotFoundError, ForbiddenError } from "@server/lib/errors";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extracts the knowledge base [id] and [remoteJid] from the URL path.
 * Path shape: /api/knowledge-bases/[id]/conversations/[remoteJid]
 *
 * Note: remoteJid values (e.g. 5511999999999@s.whatsapp.net) are URL-encoded
 * when present in the path; decodeURIComponent is applied to restore the
 * original value.
 */
function extractPathSegments(url: string): {
  kbId: string | null;
  remoteJid: string | null;
} {
  const segments = new URL(url).pathname.split("/");
  // segments: ["", "api", "knowledge-bases", "<id>", "conversations", "<remoteJid>"]
  const conversationsIndex = segments.lastIndexOf("conversations");

  const kbId =
    conversationsIndex >= 1
      ? (segments[conversationsIndex - 1] ?? null)
      : null;

  const rawRemoteJid =
    conversationsIndex >= 0 && segments.length > conversationsIndex + 1
      ? (segments[conversationsIndex + 1] ?? null)
      : null;

  const remoteJid = rawRemoteJid ? decodeURIComponent(rawRemoteJid) : null;

  return {
    kbId: kbId && kbId !== "" ? kbId : null,
    remoteJid: remoteJid && remoteJid !== "" ? remoteJid : null,
  };
}

// ---------------------------------------------------------------------------
// GET /api/knowledge-bases/[id]/conversations/[remoteJid]
// Returns the full message history for a specific conversation identified by
// the URL-encoded remoteJid (e.g. "5511999999999%40s.whatsapp.net").
//
// Responses:
//   200 — { messages: KBMessage[] } in chronological (ASC) order
//   401 — no active session
//   403 — knowledge base not found or not owned by the user (opaque)
//   404 — no KBAgent linked to this knowledge base
//
// Requirements: 8.2, 8.5, 8.7
// ---------------------------------------------------------------------------
export const GET = withErrorHandler(async (request: Request) => {
  // 1. Authenticate
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new UnauthorizedError();

  const { kbId, remoteJid } = extractPathSegments(request.url);
  if (!kbId) throw new ForbiddenError("ID da base de conhecimento inválido.");
  if (!remoteJid) throw new ForbiddenError("remoteJid inválido.");
  const userId = session.user.id;

  // 2. Get the KBAgent linked to this KnowledgeBase (also asserts ownership)
  //    getByKBId throws ForbiddenError if userId doesn't own the KB → 403
  const agent = await kbAgentService.getByKBId(userId, kbId);

  // 3. If no agent is linked, there can be no conversation history
  if (!agent) {
    throw new NotFoundError("KBAgent");
  }

  // 4. Fetch full conversation history (up to 1000 messages, chronological ASC)
  const messages = await kbMessageRepository.getHistory(agent.id, remoteJid, 1000);

  return NextResponse.json({ messages }, { status: 200 });
});
