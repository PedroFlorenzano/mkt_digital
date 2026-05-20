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
 * Extracts the knowledge base [id] segment from the URL path.
 * Path shape: /api/knowledge-bases/[id]/records
 */
function extractKbId(url: string): string | null {
  const segments = new URL(url).pathname.split("/");
  // segments: ["", "api", "knowledge-bases", "<id>", "records", ...]
  const baseIndex = segments.indexOf("knowledge-bases");
  const id = baseIndex >= 0 ? (segments[baseIndex + 1] ?? null) : null;
  return id && id !== "" ? id : null;
}

// ---------------------------------------------------------------------------
// GET /api/knowledge-bases/[id]/records
// Returns a paginated list of CatalogRecords for the given KnowledgeBase.
// Query params: page (default 1), pageSize (default 50)
// Returns HTTP 200 with { items, total, page, pageSize }
// ---------------------------------------------------------------------------
export const GET = withErrorHandler(async (request: Request) => {
  // 1. Authenticate
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new UnauthorizedError();

  const id = extractKbId(request.url);
  if (!id) throw new ForbiddenError("Acesso negado.");

  const userId = session.user.id;

  // 2. Parse pagination query params
  const searchParams = new URL(request.url).searchParams;
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.max(1, parseInt(searchParams.get("pageSize") ?? "50", 10) || 50);

  // 3. Delegate to service
  const result = await catalogRecordService.list(userId, id, page, pageSize);

  return NextResponse.json(result, { status: 200 });
});

// ---------------------------------------------------------------------------
// POST /api/knowledge-bases/[id]/records
// Creates a new CatalogRecord in the given KnowledgeBase.
// Body: Record<string, unknown>
// Returns HTTP 201 with the created CatalogRecord
// ---------------------------------------------------------------------------
export const POST = withErrorHandler(async (request: Request) => {
  // 1. Authenticate
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new UnauthorizedError();

  const id = extractKbId(request.url);
  if (!id) throw new ForbiddenError("Acesso negado.");

  const userId = session.user.id;

  // 2. Parse body
  const body = (await request.json()) as Record<string, unknown>;

  // 3. Delegate to service — ownership + validation + limit check happen inside
  const record = await catalogRecordService.create(userId, id, body);

  return NextResponse.json(record, { status: 201 });
});

// ---------------------------------------------------------------------------
// DELETE /api/knowledge-bases/[id]/records
// Deletes ALL CatalogRecords from the given KnowledgeBase (clear all).
// CatalogFields are NOT affected.
// Returns HTTP 200 with { deleted: count }
// ---------------------------------------------------------------------------
export const DELETE = withErrorHandler(async (request: Request) => {
  // 1. Authenticate
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new UnauthorizedError();

  const id = extractKbId(request.url);
  if (!id) throw new ForbiddenError("Acesso negado.");

  const userId = session.user.id;

  // 2. Delegate to service — ownership assertion happens inside
  const deleted = await catalogRecordService.deleteAll(userId, id);

  return NextResponse.json({ deleted }, { status: 200 });
});
