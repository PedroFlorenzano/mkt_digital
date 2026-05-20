import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@server/lib/auth";
import { knowledgeBaseService } from "@server/services/knowledgeBase.service";
import { withErrorHandler } from "@server/lib/api-handler";
import { UnauthorizedError } from "@server/lib/errors";
import type { CreateKBInput } from "@server/services/knowledgeBase.service";

// ---------------------------------------------------------------------------
// GET /api/knowledge-bases
// Returns the list of knowledge bases for the active company.
// Requires authenticated session with an active company.
// Returns HTTP 200 with KnowledgeBase[]
// ---------------------------------------------------------------------------
export const GET = withErrorHandler(async () => {
  // 1. Authenticate
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new UnauthorizedError();

  const activeCompanyId = session.user.activeCompanyId;
  if (!activeCompanyId) throw new UnauthorizedError("Nenhuma empresa selecionada");

  // 2. Delegate to service — listByCompanyId enforces company scoping
  const kbs = await knowledgeBaseService.listByCompanyId(activeCompanyId);

  return NextResponse.json(kbs, { status: 200 });
});

// ---------------------------------------------------------------------------
// POST /api/knowledge-bases
// Creates a new knowledge base for the active company.
// Body: CreateKBInput
// Returns HTTP 201 with the created KnowledgeBase
// ---------------------------------------------------------------------------
export const POST = withErrorHandler(async (request: Request) => {
  // 1. Authenticate
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new UnauthorizedError();

  const userId = session.user.id;
  const activeCompanyId = session.user.activeCompanyId;
  if (!activeCompanyId) throw new UnauthorizedError("Nenhuma empresa selecionada");

  // 2. Parse body
  const body = (await request.json()) as CreateKBInput;

  // 3. Delegate to service — assertOwnership + validation happen inside create
  const kb = await knowledgeBaseService.create(userId, activeCompanyId, body);

  return NextResponse.json(kb, { status: 201 });
});
