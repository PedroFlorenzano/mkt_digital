import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@server/lib/auth";
import { withErrorHandler } from "@server/lib/api-handler";
import { UnauthorizedError, ForbiddenError } from "@server/lib/errors";
import { companyService } from "@server/services/company.service";
import { getJobStatus, deleteJob } from "@server/services/video-job.service";

function extractJobId(url: string): string | null {
  const segments = new URL(url).pathname.split("/");
  const jobsIndex = segments.indexOf("jobs");
  return jobsIndex >= 0 ? (segments[jobsIndex + 1] ?? null) : null;
}

// GET /api/video/jobs/[id] — polling endpoint
export const GET = withErrorHandler(async (request: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new UnauthorizedError();

  const userId = session.user.id;
  const activeCompanyId = session.user.activeCompanyId;
  if (!activeCompanyId) throw new UnauthorizedError("Nenhuma empresa selecionada");

  const company = await companyService.assertOwnership(userId, activeCompanyId);

  const jobId = extractJobId(request.url);
  if (!jobId) throw new ForbiddenError("ID do job inválido.");

  const statusResponse = await getJobStatus(jobId, company.id);

  return NextResponse.json(statusResponse, { status: 200 });
});

// DELETE /api/video/jobs/[id]
export const DELETE = withErrorHandler(async (request: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new UnauthorizedError();

  const userId = session.user.id;
  const activeCompanyId = session.user.activeCompanyId;
  if (!activeCompanyId) throw new UnauthorizedError("Nenhuma empresa selecionada");

  const company = await companyService.assertOwnership(userId, activeCompanyId);

  const jobId = extractJobId(request.url);
  if (!jobId) throw new ForbiddenError("ID do job inválido.");

  await deleteJob(jobId, company.id);

  return new NextResponse(null, { status: 204 });
});
