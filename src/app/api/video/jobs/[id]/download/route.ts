import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@server/lib/auth";
import { prisma } from "@server/lib/prisma";
import { withErrorHandler } from "@server/lib/api-handler";
import { UnauthorizedError, ForbiddenError, NotFoundError } from "@server/lib/errors";
import { generatePresignedDownloadUrl } from "@server/lib/s3-video";

function extractJobId(url: string): string | null {
  const segments = new URL(url).pathname.split("/");
  const jobsIndex = segments.indexOf("jobs");
  return jobsIndex >= 0 ? (segments[jobsIndex + 1] ?? null) : null;
}

export const GET = withErrorHandler(async (request: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new UnauthorizedError();

  const userId = (session.user as { id: string }).id;
  const company = await prisma.company.findUnique({ where: { userId } });
  if (!company) throw new ForbiddenError("Empresa não encontrada.");

  const jobId = extractJobId(request.url);
  if (!jobId) throw new ForbiddenError("ID do job inválido.");

  const job = await prisma.videoJob.findUnique({ where: { id: jobId } });
  if (!job) throw new NotFoundError(`VideoJob ${jobId}`);
  if (job.companyId !== company.id) throw new ForbiddenError();
  if (job.status !== "completed" || !job.outputS3Key) {
    throw new NotFoundError("Vídeo não disponível — geração não concluída.");
  }

  const EXPIRY = 86400; // 24 hours
  const downloadUrl = await generatePresignedDownloadUrl(job.outputS3Key, EXPIRY);

  const expiresAt = new Date(Date.now() + EXPIRY * 1000).toISOString();
  const fileName = `video-${job.platform}-${job.targetDuration}s-${job.createdAt.toISOString().slice(0, 10)}.mp4`;

  return NextResponse.json({ downloadUrl, fileName, expiresAt }, { status: 200 });
});
