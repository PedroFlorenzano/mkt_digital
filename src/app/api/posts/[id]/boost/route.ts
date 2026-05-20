import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@server/lib/auth";
import { boostService, BoostSuggestion } from "@server/services/boost.service";
import { AppError } from "@server/lib/errors";

// POST /api/posts/[id]/boost
// Body: { action: "analyze" } | { action: "confirm", suggestion: BoostSuggestion }
export async function POST(request: Request): Promise<NextResponse> {
  // Auth
  const session = await getServerSession(authOptions);
  if (!session?.user || !session.user.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const activeCompanyId = session.user.activeCompanyId;
  if (!activeCompanyId) {
    return NextResponse.json({ error: "Nenhuma empresa selecionada" }, { status: 401 });
  }

  const userId = session.user.id;

  // Extract postId from URL: /api/posts/{postId}/boost
  const pathParts = new URL(request.url).pathname.split("/");
  // pathParts: ["", "api", "posts", "{postId}", "boost"]
  const postId = pathParts[pathParts.length - 2];
  if (!postId) {
    return NextResponse.json({ error: "Post ID inválido" }, { status: 400 });
  }

  // Parse body
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const action = body["action"];

  try {
    // Branch on action
    if (action === "analyze") {
      const suggestion = await boostService.analyzePost(activeCompanyId, postId);
      return NextResponse.json({ suggestion });
    }

    if (action === "confirm") {
      const suggestion = body["suggestion"] as BoostSuggestion | undefined;
      if (!suggestion) {
        return NextResponse.json({ error: "suggestion é obrigatório" }, { status: 400 });
      }
      await boostService.confirmBoost(activeCompanyId, postId, suggestion, userId);
      return NextResponse.json({ success: true });
    }

    // Unknown action
    return NextResponse.json({ error: `Ação desconhecida: "${String(action)}"` }, { status: 400 });
  } catch (e) {
    if (e instanceof AppError) {
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    }
    throw e;
  }
}
