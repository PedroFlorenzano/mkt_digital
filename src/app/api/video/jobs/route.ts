import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@server/lib/auth";
import { withErrorHandler } from "@server/lib/api-handler";
import { UnauthorizedError, ValidationError } from "@server/lib/errors";
import { companyService } from "@server/services/company.service";
import {
  createJob,
  listJobs,
} from "@server/services/video-job.service";
import {
  isValidContextDescription,
} from "@server/lib/video-validations";
import type { VideoPlatform, VideoVisualStyle, PollyVoice } from "@server/lib/video-validations";

const VALID_PLATFORMS: VideoPlatform[] = ["instagram_reels", "tiktok", "youtube_shorts"];
const VALID_STYLES: VideoVisualStyle[] = ["realistic", "cinematic", "minimalist"];
const VALID_DURATIONS = [15, 30, 60] as const;
const VALID_VOICES: PollyVoice[] = ["Camila", "Ricardo"];

// ---------------------------------------------------------------------------
// POST /api/video/jobs — create a new video generation job
// ---------------------------------------------------------------------------
export const POST = withErrorHandler(async (request: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new UnauthorizedError();

  const userId = session.user.id;
  const activeCompanyId = session.user.activeCompanyId;
  if (!activeCompanyId) throw new UnauthorizedError("Nenhuma empresa selecionada");

  const company = await companyService.assertOwnership(userId, activeCompanyId);

  // Validate body
  const body = await request.json() as Record<string, unknown>;
  const {
    rawVideoS3Key,
    platform,
    targetDuration,
    visualStyle,
    ctaText,
    narratorVoice = "Camila",
    contextDescription,
    useAsInspiration,
  } = body as Record<string, unknown>;

  if (!rawVideoS3Key || typeof rawVideoS3Key !== "string") {
    throw new ValidationError("O campo 'rawVideoS3Key' é obrigatório.");
  }
  if (!VALID_PLATFORMS.includes(platform as VideoPlatform)) {
    throw new ValidationError(`Plataforma inválida. Use: ${VALID_PLATFORMS.join(", ")}`);
  }
  if (!VALID_DURATIONS.includes(targetDuration as 15 | 30 | 60)) {
    throw new ValidationError("Duração inválida. Use 15, 30 ou 60 segundos.");
  }
  if (!VALID_STYLES.includes(visualStyle as VideoVisualStyle)) {
    throw new ValidationError(`Estilo visual inválido. Use: ${VALID_STYLES.join(", ")}`);
  }
  if (!VALID_VOICES.includes(narratorVoice as PollyVoice)) {
    throw new ValidationError("Voz inválida. Use 'Camila' ou 'Ricardo'.");
  }
  if (!contextDescription || !isValidContextDescription(String(contextDescription))) {
    throw new ValidationError("A descrição do contexto deve ter entre 10 e 500 caracteres.");
  }

  const job = await createJob({
    companyId: company.id,
    rawVideoS3Key: String(rawVideoS3Key),
    platform: platform as VideoPlatform,
    targetDuration: targetDuration as 15 | 30 | 60,
    visualStyle: visualStyle as VideoVisualStyle,
    ctaText: ctaText ? String(ctaText) : undefined,
    tone: company.tone,
    narratorVoice: narratorVoice as PollyVoice,
    contextDescription: String(contextDescription),
    useAsInspiration: useAsInspiration !== false,
  });

  setImmediate(() => {
    import("@server/services/video-job.service").then(({ runPipeline }) => {
      runPipeline(job.id).catch((err: unknown) => {
        console.error("[video-jobs] Pipeline failed for job", job.id, err);
      });
    }).catch(() => {});
  });

  return NextResponse.json(
    { jobId: job.id, status: job.status },
    { status: 201 },
  );
});

// ---------------------------------------------------------------------------
// GET /api/video/jobs — list jobs for current company
// ---------------------------------------------------------------------------
export const GET = withErrorHandler(async (request: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new UnauthorizedError();

  const userId = session.user.id;
  const activeCompanyId = session.user.activeCompanyId;
  if (!activeCompanyId) throw new UnauthorizedError("Nenhuma empresa selecionada");

  const company = await companyService.assertOwnership(userId, activeCompanyId);

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const pageSize = parseInt(searchParams.get("pageSize") ?? "12", 10);
  const status = searchParams.get("status") ?? undefined;
  const from = searchParams.get("from") ? new Date(searchParams.get("from")!) : undefined;
  const to = searchParams.get("to") ? new Date(searchParams.get("to")!) : undefined;

  const result = await listJobs(company.id, { page, pageSize, status, from, to });

  return NextResponse.json(result, { status: 200 });
});
