import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@server/lib/auth";
import { agentService } from "@server/services/agent.service";
import { conversationService } from "@server/services/conversation.service";
import { withErrorHandler } from "@server/lib/api-handler";
import { UnauthorizedError, ForbiddenError } from "@server/lib/errors";

/**
 * Extracts the agent [id] and [remoteJid] segments from the URL path.
 * Path shape: /api/whatsapp-agents/[id]/conversations/[remoteJid]
 * segments: ["", "api", "whatsapp-agents", "<id>", "conversations", "<remoteJid>"]
 *
 * Note: remoteJid values (e.g. 5511999999999@s.whatsapp.net) are URL-encoded
 * when present in the path; decodeURIComponent is applied to restore the
 * original value.
 */
function extractPathSegments(url: string): {
  agentId: string | null;
  remoteJid: string | null;
} {
  const segments = new URL(url).pathname.split("/");
  const conversationsIndex = segments.lastIndexOf("conversations");

  const agentId =
    conversationsIndex >= 1
      ? (segments[conversationsIndex - 1] ?? null)
      : null;

  const rawRemoteJid =
    conversationsIndex >= 0 && segments.length > conversationsIndex + 1
      ? (segments[conversationsIndex + 1] ?? null)
      : null;

  const remoteJid = rawRemoteJid
    ? decodeURIComponent(rawRemoteJid)
    : null;

  return {
    agentId: agentId && agentId !== "" ? agentId : null,
    remoteJid: remoteJid && remoteJid !== "" ? remoteJid : null,
  };
}

// ---------------------------------------------------------------------------
// GET /api/whatsapp-agents/[id]/conversations/[remoteJid]
// Returns all messages for a specific conversation (identified by remoteJid)
// in ascending chronological order.
// Requires authenticated session; asserts caller owns the agent's company.
//
// Returns HTTP 200 with MessageRecord[]
//
// Requirements: 4.3
// ---------------------------------------------------------------------------
export const GET = withErrorHandler(async (request: Request) => {
  // 1. Authenticate
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new UnauthorizedError();

  const userId = session.user.id;

  // 2. Extract path segments
  const { agentId, remoteJid } = extractPathSegments(request.url);
  if (!agentId) throw new ForbiddenError("ID do agente inválido.");
  if (!remoteJid) throw new ForbiddenError("remoteJid inválido.");

  // 3. Assert ownership — throws NotFoundError or ForbiddenError if not owned
  await agentService.assertOwnership(userId, agentId);

  // 4. Delegate to service
  const history = await conversationService.getHistory(agentId, remoteJid);

  return NextResponse.json(history, { status: 200 });
});
