import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@server/lib/auth";
import { catalogRecordService } from "@server/services/catalogRecord.service";
import { withErrorHandler } from "@server/lib/api-handler";
import { UnauthorizedError, ForbiddenError } from "@server/lib/errors";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extracts the [recordId] segment from the URL path.
 * Path shape: /api/knowledge-bases/[id]/records/[recordId]
 */
function extractRecordId(url: string): string | null {
  const segments = new URL(url).pathname.split("/");
  // segments: ["", "api", "knowledge-bases", "<id>", "records", "<recordId>", ...]
  const recordsIndex = segments.indexOf("records");
  const recordId = recordsIndex >= 0 ? (segments[recordsIndex + 1] ?? null) : null;
  return recordId && recordId !== "" ? recordId : null;
}

// ---------------------------------------------------------------------------
// PATCH /api/knowledge-bases/[id]/records/[recordId]
// Updates an existing CatalogRecord with the given data.
// Body: Record<string, unknown>
// Returns HTTP 200 with the updated CatalogRecord
// ---------------------------------------------------------------------------
export const PATCH = withErrorHandler(async (request: Request) => {
  // 1. Authenticate
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new UnauthorizedError();

  const recordId = extractRecordId(request.url);
  if (!recordId) throw new ForbiddenError("Acesso negado.");

  const userId = session.user.id;

  // 2. Parse body
  const body = (await request.json()) as Record<string, unknown>;

  // 3. Delegate to service — ownership + field validation happen inside
  const updated = await catalogRecordService.update(userId, recordId, body);

  return NextResponse.json(updated, { status: 200 });
});

// ---------------------------------------------------------------------------
// DELETE /api/knowledge-bases/[id]/records/[recordId]
// Permanently deletes a single CatalogRecord.
// Returns HTTP 204 (no content)
// ---------------------------------------------------------------------------
export const DELETE = withErrorHandler(async (request: Request) => {
  // 1. Authenticate
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new UnauthorizedError();

  const recordId = extractRecordId(request.url);
  if (!recordId) throw new ForbiddenError("Acesso negado.");

  const userId = session.user.id;

  // 2. Delegate to service — ownership assertion happens inside
  await catalogRecordService.delete(userId, recordId);

  return new NextResponse(null, { status: 204 });
});
