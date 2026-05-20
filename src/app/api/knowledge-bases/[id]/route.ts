import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@server/lib/auth";
import { knowledgeBaseService } from "@server/services/knowledgeBase.service";
import { withErrorHandler } from "@server/lib/api-handler";
import { UnauthorizedError, ForbiddenError } from "@server/lib/errors";
import type { UpdateKBInput } from "@server/services/knowledgeBase.service";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extracts the knowledge base [id] segment from the URL path.
 * Path shape: /api/knowledge-bases/[id]
 */
function extractKbId(url: string): string | null {
  const segments = new URL(url).pathname.split("/");
  // segments: ["", "api", "knowledge-bases", "<id>", ...]
  const baseIndex = segments.indexOf("knowledge-bases");
  const id = baseIndex >= 0 ? (segments[baseIndex + 1] ?? null) : null;
  return id && id !== "" ? id : null;
}

// ---------------------------------------------------------------------------
// GET /api/knowledge-bases/[id]
// Returns the KnowledgeBase record identified by [id].
// Requires authenticated session and ownership of the knowledge base.
//
// Responses:
//   200 — KnowledgeBase JSON
//   401 — no active session
//   403 — knowledge base not found or not owned by the user (opaque)
// ---------------------------------------------------------------------------
export const GET = withErrorHandler(async (request: Request) => {
  // 1. Authenticate
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new UnauthorizedError();

  const id = extractKbId(request.url);
  if (!id) throw new ForbiddenError("Acesso negado.");

  const userId = session.user.id;

  // 2. Delegate to service — assertOwnership via getById
  const kb = await knowledgeBaseService.getById(userId, id);

  return NextResponse.json(kb, { status: 200 });
});

// ---------------------------------------------------------------------------
// PATCH /api/knowledge-bases/[id]
// Updates the KnowledgeBase identified by [id].
// Body: UpdateKBInput (all fields optional)
// Requires authenticated session and ownership of the knowledge base.
//
// Responses:
//   200 — updated KnowledgeBase JSON
//   400 — validation error
//   401 — no active session
//   403 — knowledge base not found or not owned by the user (opaque)
// ---------------------------------------------------------------------------
export const PATCH = withErrorHandler(async (request: Request) => {
  // 1. Authenticate
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new UnauthorizedError();

  const id = extractKbId(request.url);
  if (!id) throw new ForbiddenError("Acesso negado.");

  const userId = session.user.id;

  // 2. Parse body
  const body = (await request.json()) as UpdateKBInput;

  // 3. Delegate to service — assertOwnership + validation happen inside update
  const updated = await knowledgeBaseService.update(userId, id, body);

  return NextResponse.json(updated, { status: 200 });
});

// ---------------------------------------------------------------------------
// DELETE /api/knowledge-bases/[id]
// Deletes the KnowledgeBase (and all child records) identified by [id].
// Requires authenticated session and ownership of the knowledge base.
//
// Responses:
//   204 — empty body
//   401 — no active session
//   403 — knowledge base not found or not owned by the user (opaque)
// ---------------------------------------------------------------------------
export const DELETE = withErrorHandler(async (request: Request) => {
  // 1. Authenticate
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new UnauthorizedError();

  const id = extractKbId(request.url);
  if (!id) throw new ForbiddenError("Acesso negado.");

  const userId = session.user.id;

  // 2. Delegate to service — assertOwnership + delete happen inside delete
  await knowledgeBaseService.delete(userId, id);

  return new NextResponse(null, { status: 204 });
});
