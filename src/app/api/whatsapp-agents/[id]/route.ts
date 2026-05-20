import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@server/lib/auth";
import { agentService } from "@server/services/agent.service";
import { withErrorHandler } from "@server/lib/api-handler";
import { UnauthorizedError, ForbiddenError } from "@server/lib/errors";
import type { UpdateAgentInput } from "@server/services/agent.service";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extracts the agent [id] segment from the URL path.
 * Path shape: /api/whatsapp-agents/[id]
 */
function extractAgentId(url: string): string | null {
  const segments = new URL(url).pathname.split("/");
  // segments: ["", "api", "whatsapp-agents", "<id>", ...]
  const baseIndex = segments.indexOf("whatsapp-agents");
  const id = baseIndex >= 0 ? (segments[baseIndex + 1] ?? null) : null;
  return id && id !== "" ? id : null;
}

// ---------------------------------------------------------------------------
// GET /api/whatsapp-agents/[id]
// Returns the full WhatsAppAgent record identified by [id].
// Requires authenticated session and ownership of the agent.
//
// Responses:
//   200 — WhatsAppAgent JSON
//   401 — no active session
//   403 — agent not found or not owned by the user (opaque, prevents enumeration)
// ---------------------------------------------------------------------------
export const GET = withErrorHandler(async (request: Request) => {
  // 1. Authenticate
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new UnauthorizedError();

  const agentId = extractAgentId(request.url);
  if (!agentId) throw new ForbiddenError("Acesso negado.");

  const userId = session.user.id;

  // 2. Assert ownership — throws NotFoundError or ForbiddenError if not allowed
  const agent = await agentService.assertOwnership(userId, agentId);

  return NextResponse.json(agent, { status: 200 });
});

// ---------------------------------------------------------------------------
// PATCH /api/whatsapp-agents/[id]
// Updates the WhatsAppAgent identified by [id].
// Body: UpdateAgentInput (all fields optional)
// Requires authenticated session and ownership of the agent.
//
// Responses:
//   200 — updated WhatsAppAgent JSON
//   400 — validation error
//   401 — no active session
//   403 — agent not found or not owned by the user (opaque)
//   409 — instanceName conflict within company
// ---------------------------------------------------------------------------
export const PATCH = withErrorHandler(async (request: Request) => {
  // 1. Authenticate
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new UnauthorizedError();

  const agentId = extractAgentId(request.url);
  if (!agentId) throw new ForbiddenError("Acesso negado.");

  const userId = session.user.id;

  // 2. Parse body
  const body = (await request.json()) as UpdateAgentInput;

  // 3. Delegate to service — assertOwnership + validation + conflict check happen inside updateAgent
  const updated = await agentService.updateAgent(userId, agentId, body);

  return NextResponse.json(updated, { status: 200 });
});

// ---------------------------------------------------------------------------
// DELETE /api/whatsapp-agents/[id]
// Deletes the WhatsAppAgent (and all child messages) identified by [id].
// Requires authenticated session and ownership of the agent.
//
// Responses:
//   200 — { ok: true }
//   401 — no active session
//   403 — agent not found or not owned by the user (opaque)
// ---------------------------------------------------------------------------
export const DELETE = withErrorHandler(async (request: Request) => {
  // 1. Authenticate
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new UnauthorizedError();

  const agentId = extractAgentId(request.url);
  if (!agentId) throw new ForbiddenError("Acesso negado.");

  const userId = session.user.id;

  // 2. Delegate to service — assertOwnership + delete happen inside deleteAgent
  await agentService.deleteAgent(userId, agentId);

  return NextResponse.json({ ok: true }, { status: 200 });
});
