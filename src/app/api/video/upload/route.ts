import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@server/lib/auth";
import { withErrorHandler } from "@server/lib/api-handler";
import { UnauthorizedError, ValidationError } from "@server/lib/errors";
import { generatePresignedUploadUrl } from "@server/lib/s3-video";
import { isValidVideoFormat } from "@server/lib/video-validations";
import { companyService } from "@server/services/company.service";
import * as crypto from "node:crypto";

function generateUuid(): string {
  return crypto.randomUUID();
}

const MAX_FILE_SIZE = 524_288_000; // 500 MB

export const POST = withErrorHandler(async (request: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new UnauthorizedError();

  const userId = session.user.id;
  const activeCompanyId = session.user.activeCompanyId;
  if (!activeCompanyId) throw new UnauthorizedError("Nenhuma empresa selecionada");

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
    throw new ValidationError("Arquivo muito grande. Limite: 500 MB.");
  }

  const company = await companyService.assertOwnership(userId, activeCompanyId);
  const ext = fileName.split(".").pop() ?? "mp4";
  const s3Key = `videos/raw/company_${company.id}/${generateUuid()}.${ext}`;
  const uploadUrl = await generatePresignedUploadUrl(s3Key, mimeType, 3600);

  return NextResponse.json({ uploadUrl, s3Key, expiresIn: 3600 }, { status: 200 });
});
