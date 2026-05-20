import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@server/lib/auth";
import { agentService } from "@server/services/agent.service";
import { withErrorHandler } from "@server/lib/api-handler";
import { UnauthorizedError, ForbiddenError } from "@server/lib/errors";

/**
 * Extracts the agent [id] segment from the URL path.
 * Path shape: /api/whatsapp-agents/[id]/status
 * segments: ["", "api", "whatsapp-agents", "<id>", "status"]
 */
function extractAgentId(url: string): string | null {
  const segments = new URL(url).pathname.split("/");
  const statusIndex = segments.lastIndexOf("status");
  const id = statusIndex >= 1 ? (segments[statusIndex - 1] ?? null) : null;
  return id && id !== "" ? id : null;
}

// ---------------------------------------------------------------------------
// PATCH /api/whatsapp-agents/[id]/status
// Toggles the WhatsApp AI agent status between "active" and "paused".
// Requires authenticated session; asserts caller owns the agent's company.
// Returns HTTP 200 with the updated WhatsAppAgent.
//
// Requirements: 1.5, 1.6, 1.7
// ---------------------------------------------------------------------------
export const PATCH = withErrorHandler(async (request: Request) => {
  // 1. Authenticate
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new UnauthorizedError();

  const userId = session.user.id;

  // 2. Extract agent ID from URL path
  const agentId = extractAgentId(request.url);
  if (!agentId) throw new ForbiddenError("ID do agente inválido.");

  // 3. Toggle status — assertOwnership (NotFoundError / ForbiddenError) + DB update
  const updated = await agentService.toggleStatus(userId, agentId);

  return NextResponse.json(updated, { status: 200 });
});
