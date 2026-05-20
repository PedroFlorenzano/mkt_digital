import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@server/lib/auth";
import {
  strategicAnalystService,
  type RouteChange,
} from "@server/services/strategic-analyst.service";
import { AppError } from "@server/lib/errors";

// ---------------------------------------------------------------------------
// GET /api/paid-traffic/strategy — Generate a strategic diagnosis
// ---------------------------------------------------------------------------
export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user || !session.user.activeCompanyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { activeCompanyId } = session.user;

  try {
    const diagnosis = await strategicAnalystService.generateDiagnosis(activeCompanyId);
    return NextResponse.json(diagnosis);
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST /api/paid-traffic/strategy — Apply a Route Change
// ---------------------------------------------------------------------------
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user || !session.user.activeCompanyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { activeCompanyId, id: userId } = session.user;

  let body: { routeChange?: unknown };
  try {
    body = (await request.json()) as { routeChange?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.routeChange) {
    return NextResponse.json(
      { error: "O campo 'routeChange' é obrigatório." },
      { status: 400 },
    );
  }

  const routeChange = body.routeChange as RouteChange;

  try {
    await strategicAnalystService.applyRouteChange(activeCompanyId, routeChange, userId);
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof AppError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
