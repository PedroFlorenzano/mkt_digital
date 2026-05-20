import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@server/lib/auth";
import { catalogFieldService } from "@server/services/catalogField.service";
import { withErrorHandler } from "@server/lib/api-handler";
import { UnauthorizedError, ForbiddenError } from "@server/lib/errors";
import type { UpdateFieldInput } from "@server/services/catalogField.service";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extracts the [fieldId] segment from the URL path.
 * Path shape: /api/knowledge-bases/[id]/fields/[fieldId]
 */
function extractFieldId(url: string): string | null {
  const segments = new URL(url).pathname.split("/");
  // segments: ["", "api", "knowledge-bases", "<id>", "fields", "<fieldId>", ...]
  const fieldsIndex = segments.indexOf("fields");
  const fieldId = fieldsIndex >= 0 ? (segments[fieldsIndex + 1] ?? null) : null;
  return fieldId && fieldId !== "" ? fieldId : null;
}

// ---------------------------------------------------------------------------
// PATCH /api/knowledge-bases/[id]/fields/[fieldId]
// Updates an existing CatalogField.
// Body: UpdateFieldInput (all fields optional)
// Requires authenticated session and ownership of the knowledge base.
//
// Responses:
//   200 — updated CatalogField JSON
//   400 — validation error (invalid name or dataType)
//   401 — no active session
//   403 — field not found or not owned by the user (opaque)
//   409 — updated name collides with another field in the knowledge base
//
// Requirements: 2.1, 2.9
// ---------------------------------------------------------------------------
export const PATCH = withErrorHandler(async (request: Request) => {
  // 1. Authenticate
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new UnauthorizedError();

  const fieldId = extractFieldId(request.url);
  if (!fieldId) throw new ForbiddenError("Acesso negado.");
  const userId = session.user.id;

  // 2. Parse body
  const body = (await request.json()) as UpdateFieldInput;

  // 3. Delegate to service — assertOwnership + validation + conflict check happen inside
  const updated = await catalogFieldService.update(userId, fieldId, body);

  return NextResponse.json(updated, { status: 200 });
});

// ---------------------------------------------------------------------------
// DELETE /api/knowledge-bases/[id]/fields/[fieldId]
// Deletes a CatalogField and removes its key from all existing CatalogRecords.
// Requires authenticated session and ownership of the knowledge base.
//
// Responses:
//   204 — empty body
//   401 — no active session
//   403 — field not found or not owned by the user (opaque)
//
// Requirements: 2.1, 2.9
// ---------------------------------------------------------------------------
export const DELETE = withErrorHandler(async (request: Request) => {
  // 1. Authenticate
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new UnauthorizedError();

  const fieldId = extractFieldId(request.url);
  if (!fieldId) throw new ForbiddenError("Acesso negado.");
  const userId = session.user.id;

  // 2. Delegate to service — assertOwnership + cascading record cleanup happen inside
  await catalogFieldService.delete(userId, fieldId);

  return new NextResponse(null, { status: 204 });
});
