import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@server/lib/auth";
import { companyService } from "@server/services/company.service";
import { withErrorHandler } from "@server/lib/api-handler";
import { UnauthorizedError } from "@server/lib/errors";

function parseColors(colors: unknown): string[] {
  if (typeof colors === "string") {
    try {
      const parsed = JSON.parse(colors) as unknown;
      if (Array.isArray(parsed)) return parsed.filter((c): c is string => typeof c === "string");
    } catch { /* ignore */ }
  }
  if (Array.isArray(colors)) return colors.filter((c): c is string => typeof c === "string");
  return [];
}

export const GET = withErrorHandler(async () => {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new UnauthorizedError();

  const userId = (session.user as { id: string }).id;
  const company = await companyService.getWithSocialByUserId(userId);

  if (!company) return NextResponse.json(null);

  return NextResponse.json({
    ...company,
    colors: parseColors(company.colors),
  });
});

export const POST = withErrorHandler(async (request: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new UnauthorizedError();

  const userId = (session.user as { id: string }).id;
  const body = await request.json() as Record<string, unknown>;

  const company = await companyService.upsert(userId, {
    name: typeof body["name"] === "string" ? body["name"] : "",
    description: typeof body["description"] === "string" ? body["description"] : undefined,
    sector: typeof body["sector"] === "string" ? body["sector"] : undefined,
    objective: typeof body["objective"] === "string" ? body["objective"] : undefined,
    tone: typeof body["tone"] === "string" ? body["tone"] : undefined,
    colors: Array.isArray(body["colors"]) ? (body["colors"] as string[]) : undefined,
  });

  return NextResponse.json({
    ...company,
    colors: parseColors(company.colors),
  });
});
