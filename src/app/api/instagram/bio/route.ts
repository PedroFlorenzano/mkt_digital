import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@server/lib/auth";
import { generateBioSuggestions } from "@server/services/bio.service";
import { AppError } from "@server/lib/errors";

export async function POST() {
  const session = await getServerSession(authOptions);

  if (!session?.user || !session.user.activeCompanyId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { activeCompanyId } = session.user;

  try {
    const suggestions = await generateBioSuggestions(activeCompanyId);
    return NextResponse.json({ suggestions });
  } catch (e) {
    if (e instanceof AppError) {
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    }
    console.error("[instagram/bio] Unexpected error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
