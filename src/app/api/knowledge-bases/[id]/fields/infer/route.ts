import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@server/lib/auth";
import { schemaInferrerService } from "@server/services/schemaInferrer.service";
import { withErrorHandler } from "@server/lib/api-handler";
import { UnauthorizedError, ValidationError } from "@server/lib/errors";

// ---------------------------------------------------------------------------
// POST /api/knowledge-bases/[id]/fields/infer
// Analyzes a CSV file and returns inferred field definitions.
// Request: multipart/form-data with a "file" field containing the CSV.
// Returns HTTP 200 with { fields: InferredField[] }
//
// Responses:
//   200 — { fields: InferredField[] }
//   400 — validation error (missing file, empty CSV, invalid encoding)
//   401 — no active session
//
// Requirements: 2.7, 2.8, 2.10
// ---------------------------------------------------------------------------
export const POST = withErrorHandler(async (request: Request) => {
  // 1. Authenticate
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new UnauthorizedError();

  // 2. Parse multipart/form-data
  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    throw new ValidationError("Arquivo CSV não encontrado no campo 'file'.");
  }

  // 3. Convert File to Buffer
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // 4. Delegate to service — CSV parsing and type inference happen inside
  const fields = await schemaInferrerService.infer(buffer);

  return NextResponse.json({ fields }, { status: 200 });
});
