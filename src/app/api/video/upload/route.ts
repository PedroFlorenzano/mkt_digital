import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@server/lib/auth";
import { prisma } from "@server/lib/prisma";
import { withErrorHandler } from "@server/lib/api-handler";
import { UnauthorizedError, ForbiddenError, ValidationError } from "@server/lib/errors";
import { generatePresignedUploadUrl } from "@server/lib/s3-video";
import { requireVideoAccess, isValidVideoFormat } from "@server/lib/video-validations";
import * as crypto from "node:crypto";

// ...generate unique id
function generateUuid(): string {
  return crypto.randomUUID();
}

const MAX_FILE_SIZE = 524_288_000; // 500 MB

export const POST = withErrorHandler(async (request: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new UnauthorizedError();

  const userId = (session.user as { id: string }).id;

  // Check plan
  const subscription = await prisma.subscription.findFirst({
    where: { userId, status: { in: ["active", "trialing"] } },
    include: { plan: true },
  });

  if (!subscription || !requireVideoAccess(subscription.plan.name)) {
    throw new ForbiddenError("Módulo de vídeo disponível apenas nos planos Profissional e Agência.");
  }

  const body = await request.json() as Record<string, unknown>;
  const { fileName, fileSize, mimeType } = body as {
    fileName?: string;
    fileSize?: number;
    mimeType?: string;
  };

  if (!fileName || typeof fileName !== "string") {
    throw new ValidationError("O campo 'fileName' é obrigatório.");
  }
  if (!mimeType || !isValidVideoFormat(mimeType)) {
    throw new ValidationError("Formato de vídeo inválido. Use MP4, MOV ou WebM.");
  }
  if (!fileSize || typeof fileSize !== "number" || fileSize > MAX_FILE_SIZE) {
    throw new ValidationError(`Arquivo muito grande. Limite: 500 MB.`);
  }

  // Get company
  const company = await prisma.company.findUnique({ where: { userId } });
  if (!company) throw new ForbiddenError("Empresa não encontrada.");

  // Build S3 key
  const ext = fileName.split(".").pop() ?? "mp4";
  const s3Key = `videos/raw/company_${company.id}/${generateUuid()}.${ext}`;

  const uploadUrl = await generatePresignedUploadUrl(s3Key, mimeType, 3600);

  return NextResponse.json({ uploadUrl, s3Key, expiresIn: 3600 }, { status: 200 });
});
