import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@server/lib/auth";
import { kbAgentService } from "@server/services/kbAgent.service";
import { withErrorHandler } from "@server/lib/api-handler";
import { UnauthorizedError, NotFoundError, ForbiddenError } from "@server/lib/errors";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extracts the knowledge base [id] segment from the URL path.
 * Path shape: /api/knowledge-bases/[id]/agent/status
 */
function extractKbId(url: string): string | null {
  const segments = new URL(url).pathname.split("/");
  // segments: ["", "api", "knowledge-bases", "<id>", "agent", "status"]
  const baseIndex = segments.indexOf("knowledge-bases");
  const id = baseIndex >= 0 ? (segments[baseIndex + 1] ?? null) : null;
  return id && id !== "" ? id : null;
}

// ---------------------------------------------------------------------------
// PATCH /api/knowledge-bases/[id]/agent/status
// Toggles the KBAgent status between "active" and "paused" for the agent
// linked to the KnowledgeBase identified by [id].
// Requires authenticated session and ownership of the KB's company.
//
// Responses:
//   200 — updated KBAgent JSON with new status
//   401 — no active session
//   403 / 404 — KB or agent not found or not owned by the user
//
// Requirements: 4.8 (status management)
// ---------------------------------------------------------------------------
export const PATCH = withErrorHandler(async (request: Request) => {
  // 1. Authenticate
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new UnauthorizedError();

  const kbId = extractKbId(request.url);
  if (!kbId) throw new ForbiddenError("Acesso negado.");
  const userId = session.user.id;

  // 2. Resolve agent by KB — getByKBId asserts ownership of the KB
  const existing = await kbAgentService.getByKBId(userId, kbId);
  if (!existing) {
    throw new NotFoundError("KBAgent");
  }

  // 3. Toggle status — additional ownership check happens inside toggleStatus
  const updated = await kbAgentService.toggleStatus(userId, existing.id);

  return NextResponse.json(updated, { status: 200 });
});
