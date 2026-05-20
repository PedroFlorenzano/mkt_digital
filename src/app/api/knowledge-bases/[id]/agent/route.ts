import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@server/lib/auth";
import { kbAgentService } from "@server/services/kbAgent.service";
import { withErrorHandler } from "@server/lib/api-handler";
import { UnauthorizedError, NotFoundError, ForbiddenError } from "@server/lib/errors";
import type {
  CreateKBAgentInput,
  UpdateKBAgentInput,
} from "@server/services/kbAgent.service";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extracts the knowledge base [id] segment from the URL path.
 * Path shape: /api/knowledge-bases/[id]/agent
 */
function extractKbId(url: string): string | null {
  const segments = new URL(url).pathname.split("/");
  // segments: ["", "api", "knowledge-bases", "<id>", "agent", ...]
  const baseIndex = segments.indexOf("knowledge-bases");
  const id = baseIndex >= 0 ? (segments[baseIndex + 1] ?? null) : null;
  return id && id !== "" ? id : null;
}

// ---------------------------------------------------------------------------
// GET /api/knowledge-bases/[id]/agent
// Returns the KBAgent linked to the KnowledgeBase identified by [id], or
// null if none exists yet.
// Requires authenticated session and ownership of the KB's company.
//
// Responses:
//   200 — KBAgent JSON, or null if no agent is linked
//   401 — no active session
//   403 / 404 — KB not found or not owned by the user
//
// Requirements: 4.1, 4.2
// ---------------------------------------------------------------------------
export const GET = withErrorHandler(async (request: Request) => {
  // 1. Authenticate
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new UnauthorizedError();

  const kbId = extractKbId(request.url);
  if (!kbId) throw new ForbiddenError("Acesso negado.");
  const userId = session.user.id;

  // 2. Delegate to service — ownership assertion happens inside getByKBId
  const agent = await kbAgentService.getByKBId(userId, kbId);

  return NextResponse.json(agent, { status: 200 });
});

// ---------------------------------------------------------------------------
// POST /api/knowledge-bases/[id]/agent
// Creates a new KBAgent for the KnowledgeBase identified by [id].
// Body: CreateKBAgentInput
// Requires authenticated session and ownership of the KB's company.
//
// Responses:
//   201 — created KBAgent JSON with webhookUrl field
//   400 — validation error
//   401 — no active session
//   403 / 404 — KB not found or not owned by the user
//   409 — KB already has an agent, or instanceName is already in use
//
// Requirements: 4.3, 4.4, 4.5, 4.6
// ---------------------------------------------------------------------------
export const POST = withErrorHandler(async (request: Request) => {
  // 1. Authenticate
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new UnauthorizedError();

  const kbId = extractKbId(request.url);
  if (!kbId) throw new ForbiddenError("Acesso negado.");
  const userId = session.user.id;

  // 2. Parse body
  const body = (await request.json()) as CreateKBAgentInput;

  // 3. Delegate to service — assertOwnership + validation + conflict checks happen inside create
  const agent = await kbAgentService.create(userId, kbId, body);

  // 4. Return agent with webhook URL
  return NextResponse.json(
    { ...agent, webhookUrl: `/api/kb-agent/${agent.id}` },
    { status: 201 },
  );
});

// ---------------------------------------------------------------------------
// PATCH /api/knowledge-bases/[id]/agent
// Updates the KBAgent linked to the KnowledgeBase identified by [id].
// Body: UpdateKBAgentInput (all fields optional)
// Requires authenticated session and ownership of the KB's company.
//
// Responses:
//   200 — updated KBAgent JSON
//   400 — validation error
//   401 — no active session
//   403 / 404 — KB or agent not found or not owned by the user
//
// Requirements: 4.8
// ---------------------------------------------------------------------------
export const PATCH = withErrorHandler(async (request: Request) => {
  // 1. Authenticate
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new UnauthorizedError();

  const kbId = extractKbId(request.url);
  if (!kbId) throw new ForbiddenError("Acesso negado.");
  const userId = session.user.id;

  // 2. Parse body
  const body = (await request.json()) as UpdateKBAgentInput;

  // 3. Resolve agent by KB — getByKBId asserts ownership of the KB
  const existing = await kbAgentService.getByKBId(userId, kbId);
  if (!existing) {
    throw new NotFoundError("KBAgent");
  }

  // 4. Delegate update to service using the resolved agent ID
  const updated = await kbAgentService.update(userId, existing.id, body);

  return NextResponse.json(updated, { status: 200 });
});

// ---------------------------------------------------------------------------
// DELETE /api/knowledge-bases/[id]/agent
// Deletes the KBAgent linked to the KnowledgeBase identified by [id].
// Requires authenticated session and ownership of the KB's company.
//
// Responses:
//   204 — no content
//   401 — no active session
//   403 / 404 — KB or agent not found or not owned by the user
//
// Requirements: 4.9
// ---------------------------------------------------------------------------
export const DELETE = withErrorHandler(async (request: Request) => {
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

  // 3. Delegate to service — additional ownership check happens inside delete
  await kbAgentService.delete(userId, existing.id);

  return new NextResponse(null, { status: 204 });
});
