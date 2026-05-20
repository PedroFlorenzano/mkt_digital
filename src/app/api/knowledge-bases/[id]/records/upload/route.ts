import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@server/lib/auth";
import { csvIngestorService } from "@server/services/csvIngestor.service";
import { withErrorHandler } from "@server/lib/api-handler";
import { UnauthorizedError, ForbiddenError, ValidationError } from "@server/lib/errors";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extracts the knowledge base [id] segment from the URL path.
 * Path shape: /api/knowledge-bases/[id]/records/upload
 */
function extractKbId(url: string): string | null {
  const segments = new URL(url).pathname.split("/");
  // segments: ["", "api", "knowledge-bases", "<id>", "records", "upload"]
  const baseIndex = segments.indexOf("knowledge-bases");
  const id = baseIndex >= 0 ? (segments[baseIndex + 1] ?? null) : null;
  return id && id !== "" ? id : null;
}

// ---------------------------------------------------------------------------
// POST /api/knowledge-bases/[id]/records/upload
// Ingests a CSV file into the given KnowledgeBase.
// Request: multipart/form-data with a "file" field containing the CSV.
// Returns HTTP 200 with IngestResult { created, errors, errorDetails }
// ---------------------------------------------------------------------------
export const POST = withErrorHandler(async (request: Request) => {
  // 1. Authenticate
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new UnauthorizedError();

  const id = extractKbId(request.url);
  if (!id) throw new ForbiddenError("Acesso negado.");

  // 2. Parse multipart/form-data
  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    throw new ValidationError("Arquivo CSV não encontrado no campo 'file'.");
  }

  // 3. Convert File to Buffer
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // 4. Delegate to service — size/line/record limit validation happen inside
  const result = await csvIngestorService.ingest(id, buffer);

  return NextResponse.json(result, { status: 200 });
});
