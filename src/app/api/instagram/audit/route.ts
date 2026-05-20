import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@server/lib/auth";
import { auditProfile } from "@server/services/profile-auditor.service";
import { AppError } from "@server/lib/errors";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const activeCompanyId = session.user.activeCompanyId;
  if (!activeCompanyId) {
    return NextResponse.json({ error: "Nenhuma empresa selecionada" }, { status: 401 });
  }

  let body: {
    bio?: unknown;
    followerCount?: unknown;
    engagementRate?: unknown;
    niche?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { bio, followerCount, engagementRate, niche } = body;

  try {
    const result = await auditProfile(activeCompanyId, {
      bio: bio as string,
      followerCount: followerCount as number,
      engagementRate: engagementRate as number,
      niche: niche as string,
    });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof AppError) {
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    }
    console.error("[instagram/audit] Unexpected error:", e);
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 });
  }
}
