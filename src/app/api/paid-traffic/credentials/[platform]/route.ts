import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@server/lib/auth";
import { prisma } from "@server/lib/prisma";
import { requireTrafficAccess } from "@server/lib/plan-guard";
import { credentialService, type AdPlatform } from "@server/services/credential.service";
import { withErrorHandler } from "@server/lib/api-handler";
import { UnauthorizedError } from "@server/lib/errors";

const VALID_PLATFORMS: AdPlatform[] = ["meta", "google"];

export const DELETE = withErrorHandler(async (request: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new UnauthorizedError();

  const userId = (session.user as { id: string }).id;
  await requireTrafficAccess(userId);

  // Extract platform from the URL path: /api/paid-traffic/credentials/[platform]
  const segments = new URL(request.url).pathname.split("/");
  const platform = segments[segments.length - 1];

  if (!platform || !VALID_PLATFORMS.includes(platform as AdPlatform)) {
    return NextResponse.json(
      { error: "Plataforma inválida. Use 'meta' ou 'google'." },
      { status: 400 },
    );
  }

  const company = await prisma.company.findUnique({ where: { userId } });
  if (!company) {
    return NextResponse.json(
      { error: "Empresa não configurada." },
      { status: 400 },
    );
  }

  // credentialService.delete throws NotFoundError (→ 404) if credential doesn't exist
  await credentialService.delete(company.id, platform as AdPlatform);

  return new NextResponse(null, { status: 204 });
});
