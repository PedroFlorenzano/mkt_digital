import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@server/lib/auth";
import { agentService } from "@server/services/agent.service";
import { withErrorHandler } from "@server/lib/api-handler";
import { UnauthorizedError } from "@server/lib/errors";
import type { CreateAgentInput } from "@server/services/agent.service";

// ---------------------------------------------------------------------------
// GET /api/whatsapp-agents
// Returns the list of WhatsApp AI agents for the active company.
// Requires authenticated session with an active company.
// Returns HTTP 200 with AgentSummary[]
// ---------------------------------------------------------------------------
export const GET = withErrorHandler(async () => {
  // 1. Authenticate
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new UnauthorizedError();

  const activeCompanyId = session.user.activeCompanyId;
  if (!activeCompanyId) throw new UnauthorizedError("Nenhuma empresa selecionada");

  // 2. Delegate to service — listByCompanyId enforces company scoping
  const agents = await agentService.listByCompanyId(activeCompanyId);

  return NextResponse.json(agents, { status: 200 });
});

// ---------------------------------------------------------------------------
// POST /api/whatsapp-agents
// Creates a new WhatsApp AI agent for the active company.
// Body: CreateAgentInput
// Returns HTTP 201 with the created WhatsAppAgent
// ---------------------------------------------------------------------------
export const POST = withErrorHandler(async (request: Request) => {
  // 1. Authenticate
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new UnauthorizedError();

  const userId = session.user.id;
  const activeCompanyId = session.user.activeCompanyId;
  if (!activeCompanyId) throw new UnauthorizedError("Nenhuma empresa selecionada");

  // 2. Parse body
  const body = (await request.json()) as CreateAgentInput;

  // 3. Delegate to service — assertOwnership + validation happen inside createAgent
  const agent = await agentService.createAgent(userId, activeCompanyId, body);

  return NextResponse.json(agent, { status: 201 });
});
