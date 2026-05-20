import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@server/lib/auth";
import { agentService } from "@server/services/agent.service";
import { conversationService } from "@server/services/conversation.service";
import { withErrorHandler } from "@server/lib/api-handler";
import { UnauthorizedError, ForbiddenError } from "@server/lib/errors";

/**
 * Extracts the agent [id] segment from the URL path.
 * Path shape: /api/whatsapp-agents/[id]/conversations
 * segments: ["", "api", "whatsapp-agents", "<id>", "conversations"]
 */
function extractAgentId(url: string): string | null {
  const segments = new URL(url).pathname.split("/");
  const conversationsIndex = segments.lastIndexOf("conversations");
  const id =
    conversationsIndex >= 1 ? (segments[conversationsIndex - 1] ?? null) : null;
  return id && id !== "" ? id : null;
}

// ---------------------------------------------------------------------------
// GET /api/whatsapp-agents/[id]/conversations
// Returns a paginated list of conversations (grouped by remoteJid) for the
// given agent, sorted by most-recent message descending.
// Requires authenticated session; asserts caller owns the agent's company.
//
// Query params:
//   page     — 1-based page number (default: 1)
//   pageSize — number of items per page (default: 20)
//
// Returns HTTP 200 with ConversationSummary[]
//
// Requirements: 4.2
// ---------------------------------------------------------------------------
export const GET = withErrorHandler(async (request: Request) => {
  // 1. Authenticate
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new UnauthorizedError();

  const userId = session.user.id;

  // 2. Extract agent ID from URL path
  const agentId = extractAgentId(request.url);
  if (!agentId) throw new ForbiddenError("ID do agente inválido.");

  // 3. Assert ownership — throws NotFoundError or ForbiddenError if not owned
  await agentService.assertOwnership(userId, agentId);

  // 4. Parse pagination query params
  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.max(
    1,
    parseInt(searchParams.get("pageSize") ?? "20", 10) || 20,
  );

  // 5. Delegate to service
  const conversations = await conversationService.listConversations(
    agentId,
    page,
    pageSize,
  );

  return NextResponse.json(conversations, { status: 200 });
});
