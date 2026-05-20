import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@server/lib/auth";
import { getFeedGrid, reorderGrid } from "@server/services/feed-grid.service";
import { AppError } from "@server/lib/errors";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || !session.user.activeCompanyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { activeCompanyId } = session.user;

  try {
    const posts = await getFeedGrid(activeCompanyId);
    return NextResponse.json({ posts });
  } catch (e) {
    if (e instanceof AppError) {
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    }
    throw e;
  }
}

export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !session.user.activeCompanyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { activeCompanyId } = session.user;

  const body = await request.json() as Record<string, unknown>;
  const { postId, gridOrder } = body;

  if (!postId || gridOrder === undefined || gridOrder === null) {
    return NextResponse.json({ error: "postId and gridOrder are required" }, { status: 400 });
  }

  try {
    await reorderGrid(activeCompanyId, postId as string, gridOrder as number);
    return NextResponse.json({ success: true });
  } catch (e) {
    if (e instanceof AppError) {
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    }
    throw e;
  }
}
