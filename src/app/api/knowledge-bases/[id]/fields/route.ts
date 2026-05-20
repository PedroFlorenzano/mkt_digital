import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@server/lib/auth";
import { catalogFieldService } from "@server/services/catalogField.service";
import { withErrorHandler } from "@server/lib/api-handler";
import { UnauthorizedError, ForbiddenError } from "@server/lib/errors";
import type { CreateFieldInput } from "@server/services/catalogField.service";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extracts the knowledge base [id] segment from the URL path.
 * Path shape: /api/knowledge-bases/[id]/fields
 */
function extractKbId(url: string): string | null {
  const segments = new URL(url).pathname.split("/");
  // segments: ["", "api", "knowledge-bases", "<id>", "fields", ...]
  const baseIndex = segments.indexOf("knowledge-bases");
  const id = baseIndex >= 0 ? (segments[baseIndex + 1] ?? null) : null;
  return id && id !== "" ? id : null;
}

// ---------------------------------------------------------------------------
// GET /api/knowledge-bases/[id]/fields
// Returns all CatalogFields for the given KnowledgeBase, ordered by
// displayOrder asc then name asc.
// Requires authenticated session and ownership of the knowledge base.
//
// Responses:
//   200 — CatalogField[]
//   401 — no active session
//   403 — knowledge base not found or not owned by the user (opaque)
//
// Requirements: 2.1, 2.2
// ---------------------------------------------------------------------------
export const GET = withErrorHandler(async (_request: Request) => {
  // 1. Authenticate
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new UnauthorizedError();

  const id = extractKbId(_request.url);
  if (!id) throw new ForbiddenError("Acesso negado.");
  const userId = session.user.id;

  // 2. Delegate to service — assertOwnership happens inside
  const fields = await catalogFieldService.listByKBId(userId, id);

  return NextResponse.json(fields, { status: 200 });
});

// ---------------------------------------------------------------------------
// POST /api/knowledge-bases/[id]/fields
// Creates a new CatalogField for the given KnowledgeBase.
// Body: CreateFieldInput
// Requires authenticated session and ownership of the knowledge base.
//
// Responses:
//   201 — created CatalogField JSON
//   400 — validation error (invalid name, dataType, or field limit reached)
//   401 — no active session
//   403 — knowledge base not found or not owned by the user (opaque)
//   409 — field name already exists in the knowledge base
//
// Requirements: 2.1, 2.3, 2.5, 2.6
// ---------------------------------------------------------------------------
export const POST = withErrorHandler(async (request: Request) => {
  // 1. Authenticate
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new UnauthorizedError();

  const id = extractKbId(request.url);
  if (!id) throw new ForbiddenError("Acesso negado.");
  const userId = session.user.id;

  // 2. Parse body
  const body = (await request.json()) as CreateFieldInput;

  // 3. Delegate to service — assertOwnership + validation + conflict check happen inside
  const field = await catalogFieldService.create(userId, id, body);

  return NextResponse.json(field, { status: 201 });
});
