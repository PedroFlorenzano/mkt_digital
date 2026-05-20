import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@server/lib/auth";
import { kbAgentService } from "@server/services/kbAgent.service";
import { kbMessageRepository } from "@server/repositories/kbMessage.repository";
import { withErrorHandler } from "@server/lib/api-handler";
import { UnauthorizedError, ForbiddenError } from "@server/lib/errors";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extracts the knowledge base [id] segment from the URL path.
 * Path shape: /api/knowledge-bases/[id]/conversations
 */
function extractKbId(url: string): string | null {
  const segments = new URL(url).pathname.split("/");
  // segments: ["", "api", "knowledge-bases", "<id>", "conversations", ...]
  const baseIndex = segments.indexOf("knowledge-bases");
  const id = baseIndex >= 0 ? (segments[baseIndex + 1] ?? null) : null;
  return id && id !== "" ? id : null;
}

// ---------------------------------------------------------------------------
// GET /api/knowledge-bases/[id]/conversations
// Returns a paginated list of conversations (grouped by remoteJid) for the
// KBAgent linked to the given KnowledgeBase.
//
// Query params:
//   page      — 1-based page number (default: 1)
//
// Responses:
//   200 — { conversations: KBConversationSummary[], total: number }
//   401 — no active session
//   403 — knowledge base not found or not owned by the user (opaque)
//
// Requirements: 8.1, 8.5, 8.6
// ---------------------------------------------------------------------------
export const GET = withErrorHandler(async (request: Request) => {
  // 1. Authenticate
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new UnauthorizedError();

  const id = extractKbId(request.url);
  if (!id) throw new ForbiddenError("Acesso negado.");
  const userId = session.user.id;

  // 2. Parse pagination query params
  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = 20;

  // 3. Get the KBAgent linked to this KnowledgeBase (also asserts ownership)
  //    getByKBId throws ForbiddenError if userId doesn't own the KB → 403
  const agent = await kbAgentService.getByKBId(userId, id);

  // 4. If no agent is linked yet, return empty result
  if (!agent) {
    return NextResponse.json({ conversations: [], total: 0 }, { status: 200 });
  }

  // 5. Fetch paginated conversation summaries
  const conversations = await kbMessageRepository.listConversations(agent.id, page, pageSize);

  return NextResponse.json({ conversations }, { status: 200 });
});
