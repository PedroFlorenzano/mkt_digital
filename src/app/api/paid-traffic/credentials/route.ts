import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@server/lib/auth";
import { prisma } from "@server/lib/prisma";
import { credentialService, type AdPlatform, type RawCredentialData } from "@server/services/credential.service";
import { companyService } from "@server/services/company.service";
import { metaAdsConnector } from "@server/lib/meta-ads.connector";
import { googleAdsConnector } from "@server/lib/google-ads.connector";
import { withErrorHandler } from "@server/lib/api-handler";
import { UnauthorizedError } from "@server/lib/errors";

export const GET = withErrorHandler(async () => {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new UnauthorizedError();

  const userId = session.user.id;
  const activeCompanyId = session.user.activeCompanyId;
  if (!activeCompanyId) throw new UnauthorizedError("Nenhuma empresa selecionada");

  const company = await companyService.assertOwnership(userId, activeCompanyId);

  const credentials = await prisma.adPlatformCredential.findMany({
    where: { companyId: company.id },
    select: {
      id: true,
      platform: true,
      isValid: true,
      validatedAt: true,
    },
  });

  return NextResponse.json(credentials, { status: 200 });
});

const VALID_PLATFORMS: AdPlatform[] = ["meta", "google"];

export const POST = withErrorHandler(async (request: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new UnauthorizedError();

  const userId = session.user.id;
  const activeCompanyId = session.user.activeCompanyId;
  if (!activeCompanyId) throw new UnauthorizedError("Nenhuma empresa selecionada");

  const company = await companyService.assertOwnership(userId, activeCompanyId);

  const body = (await request.json()) as Record<string, unknown>;
  const { platform, ...rest } = body;

  if (!platform || !VALID_PLATFORMS.includes(platform as AdPlatform)) {
    return NextResponse.json(
      { error: "Plataforma inválida. Use 'meta' ou 'google'." },
      { status: 400 },
    );
  }

  const adPlatform = platform as AdPlatform;
  const data = rest as RawCredentialData;

  // Save (encrypt + persist) — always resets isValid to false
  const saved = await credentialService.save(company.id, adPlatform, data);

  // Retrieve decrypted credential to pass to connector
  const decrypted = await credentialService.get(company.id, adPlatform);

  // Validate against the external platform
  const result =
    adPlatform === "meta"
      ? await metaAdsConnector.validateCredentials(decrypted)
      : await googleAdsConnector.validateCredentials(decrypted);

  if (result.valid) {
    const updated = await credentialService.markValid(company.id, adPlatform);
    return NextResponse.json(
      {
        id: updated.id,
        platform: updated.platform,
        isValid: true,
        validatedAt: updated.validatedAt,
      },
      { status: 201 },
    );
  }

  // Credentials are invalid — persist the invalid state and return a safe error
  await credentialService.markInvalid(company.id, adPlatform, result.error ?? "Validação falhou");

  const platformLabel = adPlatform === "meta" ? "Meta Ads" : "Google Ads";
  const errorDetail = result.error
    ? `Motivo: ${result.error}`
    : "Verifique se todos os campos estão corretos e tente novamente.";

  return NextResponse.json(
    {
      error: `Credenciais do ${platformLabel} inválidas. ${errorDetail}`,
      id: saved.id,
      platform: saved.platform,
      isValid: false,
    },
    { status: 400 },
  );
});

