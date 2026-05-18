/**
 * video-job.service.ts
 *
 * Orchestrates the AI Video Generation pipeline.
 * Creates jobs, manages state transitions, runs the full pipeline
 * and exposes query methods for polling and listing.
 */

import { prisma } from "@server/lib/prisma";
import { generateTextWithBedrock } from "@server/lib/bedrock";
import { deleteVideoArtifacts, buildJobS3Prefix } from "@server/lib/s3-video";
import { deserializeBrief, serializeBrief, validateBrief } from "@server/lib/video-brief";
import { uploadVideoArtifact } from "@server/lib/s3-video";
import { extractFrames } from "@server/services/frame-extractor.service";
import { transformFrames } from "@server/services/frame-transformer.service";
import { generateNarration } from "@server/services/narration.service";
import { assembleVideo } from "@server/services/video-assembler.service";
import { logger } from "@server/lib/logger";
import { NotFoundError, ForbiddenError } from "@server/lib/errors";
import { isDevMode, buildLocalJobKey } from "@server/lib/local-storage";
import type { VideoJob } from "@prisma/client";
import type { MusicCategory, OverlayText, FramePrompt } from "@server/lib/video-brief";
import type { VideoPlatform, VideoVisualStyle, PollyVoice } from "@server/lib/video-validations";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type VideoJobStatus =
  | "queued"
  | "extracting_frames"
  | "frames_extracted"
  | "generating_script"
  | "script_generated"
  | "transforming_frames"
  | "frames_transformed"
  | "generating_narration"
  | "narration_generated"
  | "assembling"
  | "completed"
  | "error";

export interface VideoJobConfig {
  companyId: string;
  rawVideoS3Key: string;
  platform: VideoPlatform;
  targetDuration: 15 | 30 | 60;
  visualStyle: VideoVisualStyle;
  ctaText?: string;
  tone: string;
  narratorVoice: PollyVoice;
  contextDescription: string;
  /**
   * true  = vídeo enviado é apenas inspiração; IA gera cenas novas (padrão)
   * false = vídeo enviado é a base; aplicar edições profissionais sem substituir as cenas
   */
  useAsInspiration?: boolean;
}

export interface VideoJobStatusResponse {
  id: string;
  status: VideoJobStatus;
  progress: number;
  platform: string;
  targetDuration: number;
  errorMessage?: string;
  stepDurations: Array<{ step: string; durationMs: number }>;
  estimatedRemainingSeconds?: number;
  outputDurationSeconds?: number;
  outputFileSizeBytes?: number;
  outputResolution?: string;
  creditDeducted?: boolean;
  createdAt: string;
  completedAt?: string;
}

// Progress percentages per status
const STATUS_PROGRESS: Record<VideoJobStatus, number> = {
  queued: 0,
  extracting_frames: 10,
  frames_extracted: 20,
  generating_script: 30,
  script_generated: 40,
  transforming_frames: 55,
  frames_transformed: 70,
  generating_narration: 80,
  narration_generated: 85,
  assembling: 90,
  completed: 100,
  error: 0,
};

const MAX_JOB_COST_USD = 2.0;

// ---------------------------------------------------------------------------
// createJob
// ---------------------------------------------------------------------------

export async function createJob(config: VideoJobConfig): Promise<VideoJob> {
  // Fetch company for tone
  const company = await prisma.company.findUnique({
    where: { id: config.companyId },
    select: { tone: true },
  });

  const tone = config.tone || company?.tone || "professional";

  const job = await prisma.videoJob.create({
    data: {
      companyId: config.companyId,
      status: "queued",
      progress: 0,
      platform: config.platform,
      targetDuration: config.targetDuration,
      visualStyle: config.visualStyle,
      ctaText: config.ctaText ?? null,
      tone,
      narratorVoice: config.narratorVoice,
      contextDescription: config.contextDescription,
      rawVideoS3Key: config.rawVideoS3Key,
      useAsInspiration: config.useAsInspiration ?? true,
    },
  });

  logger.info("[video-job] Job created", {
    jobId: job.id,
    companyId: config.companyId,
    platform: config.platform,
  });

  return job;
}

// ---------------------------------------------------------------------------
// runPipeline
// ---------------------------------------------------------------------------

/**
 * Executes the full pipeline for a queued job.
 * Updates status and progress after each step.
 * Stops if cumulative cost exceeds $2.00.
 */
export async function runPipeline(jobId: string): Promise<void> {
  const job = await prisma.videoJob.findUnique({ where: { id: jobId } });
  if (!job) {
    logger.error("[video-job] runPipeline called for non-existent job", { jobId });
    return;
  }

  const stepDurations: Array<{ step: string; durationMs: number }> = [];
  let totalCostUsd = 0;

  const updateStatus = async (
    status: VideoJobStatus,
    extra?: Partial<{
      framesExtracted: number;
      framesTransformed: number;
      briefS3Key: string;
      outputS3Key: string;
      outputDurationSeconds: number;
      outputFileSizeBytes: number;
      outputResolution: string;
      errorMessage: string;
    }>,
  ) => {
    await prisma.videoJob.update({
      where: { id: jobId },
      data: {
        status,
        progress: STATUS_PROGRESS[status],
        stepDurationsJson: JSON.stringify(stepDurations),
        estimatedCostUsd: totalCostUsd,
        startedAt: status === "extracting_frames" ? new Date() : undefined,
        completedAt: status === "completed" ? new Date() : undefined,
        ...extra,
      },
    });
  };

  const fail = async (message: string) => {
    logger.error("[video-job] Pipeline failed", { jobId, message });
    await prisma.videoJob.update({
      where: { id: jobId },
      data: {
        status: "error",
        errorMessage: message,
        stepDurationsJson: JSON.stringify(stepDurations),
        estimatedCostUsd: totalCostUsd,
      },
    });
  };

  try {
    // ── Step 1: Extract frames ──────────────────────────────────────────
    const t1 = Date.now();
    await updateStatus("extracting_frames");

    let extractionResult;
    try {
      // Estimate duration from rawVideoS3Key name or default 60s
      // In a real implementation, we'd probe the video duration with ffprobe first
      const estimatedDuration = job.targetDuration * 2; // conservative estimate

      extractionResult = await extractFrames(
        jobId,
        job.rawVideoS3Key!,
        estimatedDuration,
      );
    } catch (err) {
      await fail(err instanceof Error ? err.message : "Falha na extração de frames");
      return;
    }

    stepDurations.push({ step: "extracting_frames", durationMs: Date.now() - t1 });
    await updateStatus("frames_extracted", {
      framesExtracted: extractionResult.totalFrames,
    });

    // ── Step 2: Generate AI script (Claude) ───────────────────────────
    const t2 = Date.now();
    await updateStatus("generating_script");

    let brief;
    try {
      brief = await generateBrief(job, extractionResult.selectedS3Keys);
      totalCostUsd += 0.01; // approximate Claude cost
    } catch (err) {
      await fail(err instanceof Error ? err.message : "Falha na análise de IA");
      return;
    }

    // Check cost limit
    if (totalCostUsd > MAX_JOB_COST_USD) {
      await fail(`Limite de custo excedido (USD ${totalCostUsd.toFixed(3)} > ${MAX_JOB_COST_USD})`);
      return;
    }

    // Store brief in S3 (or local disk in dev)
    const prefix = buildJobS3Prefix(jobId);
    const briefS3Key = isDevMode()
      ? buildLocalJobKey(jobId, "brief.json")
      : `${prefix}brief.json`;
    await uploadVideoArtifact(briefS3Key, Buffer.from(serializeBrief(brief)), "application/json");

    stepDurations.push({ step: "generating_script", durationMs: Date.now() - t2 });
    await updateStatus("script_generated", { briefS3Key });

    // ── Step 3: Transform frames (Stable Diffusion) ───────────────────
    const t3 = Date.now();
    await updateStatus("transforming_frames");

    const frameInputs = extractionResult.selectedS3Keys.map((s3Key, i) => ({
      frameIndex: extractionResult.selectedFrames[i] ?? i,
      s3Key,
      prompt: brief.framePrompts[i]?.prompt ?? brief.framePrompts[0]?.prompt ?? `${job.visualStyle} marketing photography`,
    }));

    let transformResults;
    try {
      transformResults = await transformFrames(
        jobId,
        job.companyId,
        frameInputs,
        job.visualStyle,
      );
      totalCostUsd += transformResults.reduce((sum, r) => sum + r.costUsd, 0);
    } catch (err) {
      await fail(err instanceof Error ? err.message : "Falha na transformação de frames");
      return;
    }

    stepDurations.push({ step: "transforming_frames", durationMs: Date.now() - t3 });
    await updateStatus("frames_transformed", {
      framesTransformed: transformResults.length,
    });

    // ── Step 4: Generate narration (Polly) ────────────────────────────
    const t4 = Date.now();
    await updateStatus("generating_narration");

    let narrationResult;
    try {
      narrationResult = await generateNarration(
        jobId,
        job.companyId,
        brief.script,
        job.narratorVoice as "Camila" | "Ricardo",
      );
      totalCostUsd += narrationResult.characterCount * 0.000004;
    } catch (err) {
      await fail(err instanceof Error ? err.message : "Falha na geração de narração");
      return;
    }

    stepDurations.push({ step: "generating_narration", durationMs: Date.now() - t4 });
    await updateStatus("narration_generated");

    // ── Step 5: Assemble final video (ffmpeg) ─────────────────────────
    const t5 = Date.now();
    await updateStatus("assembling");

    let assemblyResult;
    try {
      assemblyResult = await assembleVideo({
        jobId,
        companyId: job.companyId,
        platform: job.platform as VideoPlatform,
        targetDurationSeconds: job.targetDuration,
        transformedFrameS3Keys: transformResults.map((r) => r.s3Key),
        rawVideoS3Key: job.rawVideoS3Key ?? undefined,
        narrationS3Key: narrationResult.s3Key,
        overlayTexts: brief.overlayTexts,
        musicCategory: brief.musicCategory,
        script: brief.script,
        useAsInspiration: job.useAsInspiration,
      });
    } catch (err) {
      await fail(err instanceof Error ? err.message : "Falha na montagem do vídeo");
      return;
    }

    stepDurations.push({ step: "assembling", durationMs: Date.now() - t5 });

    // ── Step 6: Finalize ──────────────────────────────────────────────
    totalCostUsd += assemblyResult.totalCostUsd;

    await updateStatus("completed", {
      outputS3Key: assemblyResult.outputS3Key,
      outputDurationSeconds: assemblyResult.durationSeconds,
      outputFileSizeBytes: assemblyResult.fileSizeBytes,
      outputResolution: assemblyResult.resolution,
    });

    // Deduct video credit
    await deductCredit(job.companyId, jobId);

    logger.info("[video-job] Pipeline completed", {
      jobId,
      durationSeconds: assemblyResult.durationSeconds,
      totalCostUsd,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("[video-job] Unexpected pipeline error", err, { jobId });
    await fail(`Erro inesperado: ${message}`);
  }
}

// ---------------------------------------------------------------------------
// getJobStatus (for polling)
// ---------------------------------------------------------------------------

export async function getJobStatus(
  jobId: string,
  companyId: string,
): Promise<VideoJobStatusResponse> {
  const job = await prisma.videoJob.findUnique({ where: { id: jobId } });
  if (!job) throw new NotFoundError(`VideoJob ${jobId}`);
  if (job.companyId !== companyId) throw new ForbiddenError();

  let stepDurations: Array<{ step: string; durationMs: number }> = [];
  try {
    if (job.stepDurationsJson) {
      stepDurations = JSON.parse(job.stepDurationsJson) as typeof stepDurations;
    }
  } catch { /* ignore */ }

  const estimatedRemainingSeconds = await estimateRemainingTime(job);

  return {
    id: job.id,
    status: job.status as VideoJobStatus,
    progress: job.progress,
    platform: job.platform,
    targetDuration: job.targetDuration,
    errorMessage: job.errorMessage ?? undefined,
    stepDurations,
    estimatedRemainingSeconds,
    outputDurationSeconds: job.outputDurationSeconds ?? undefined,
    outputFileSizeBytes: job.outputFileSizeBytes ? Number(job.outputFileSizeBytes) : undefined,
    outputResolution: job.outputResolution ?? undefined,
    creditDeducted: job.creditDeducted,
    createdAt: job.createdAt.toISOString(),
    completedAt: job.completedAt?.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// listJobs
// ---------------------------------------------------------------------------

export async function listJobs(
  companyId: string,
  options?: {
    page?: number;
    pageSize?: number;
    status?: string;
    from?: Date;
    to?: Date;
  },
): Promise<{ jobs: VideoJob[]; pagination: { page: number; pageSize: number; total: number; totalPages: number } }> {
  const page = Math.max(1, options?.page ?? 1);
  const pageSize = Math.max(1, Math.min(50, options?.pageSize ?? 12));
  const skip = (page - 1) * pageSize;

  const where = {
    companyId,
    ...(options?.status ? { status: options.status } : {}),
    ...(options?.from || options?.to
      ? {
          createdAt: {
            ...(options.from ? { gte: options.from } : {}),
            ...(options.to ? { lte: options.to } : {}),
          },
        }
      : {}),
  };

  const [total, jobs] = await Promise.all([
    prisma.videoJob.count({ where }),
    prisma.videoJob.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
  ]);

  return {
    jobs,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  };
}

// ---------------------------------------------------------------------------
// deleteJob
// ---------------------------------------------------------------------------

export async function deleteJob(jobId: string, companyId: string): Promise<void> {
  const job = await prisma.videoJob.findUnique({ where: { id: jobId } });
  if (!job) throw new NotFoundError(`VideoJob ${jobId}`);
  if (job.companyId !== companyId) throw new ForbiddenError();

  // Collect all S3 keys to delete
  const prefix = buildJobS3Prefix(jobId);
  const keysToDelete: string[] = [];

  if (job.rawVideoS3Key) keysToDelete.push(job.rawVideoS3Key);
  if (job.briefS3Key) keysToDelete.push(job.briefS3Key);
  if (job.outputS3Key) keysToDelete.push(job.outputS3Key);

  // Add known frame prefixes (best-effort; if S3 bucket has list permissions use ListObjects)
  const framesToDelete = (job.framesExtracted ?? 0);
  for (let i = 0; i < framesToDelete; i++) {
    keysToDelete.push(`${prefix}frames/frame_${String(i).padStart(4, "0")}.jpg`);
    keysToDelete.push(`${prefix}transformed/frame_${String(i).padStart(4, "0")}.jpg`);
  }
  keysToDelete.push(`${prefix}narration/audio.mp3`);

  // Delete from S3 (best-effort)
  try {
    await deleteVideoArtifacts(keysToDelete.filter(Boolean));
  } catch (err) {
    logger.warn("[video-job] S3 cleanup partially failed during job deletion", { jobId, err });
  }

  // Delete from database (cascades to CostLog via relation)
  await prisma.videoJob.delete({ where: { id: jobId } });

  logger.info("[video-job] Job deleted", { jobId, companyId });
}

// ---------------------------------------------------------------------------
// Credit management
// ---------------------------------------------------------------------------

export async function getOrCreateCreditBalancePublic(companyId: string): Promise<number> {
  return getOrCreateCreditBalance(companyId);
}

async function getOrCreateCreditBalance(companyId: string): Promise<number> {
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // Internal platform: unlimited credits — use a large fixed number so the
  // upsert record exists for cost tracking without ever blocking generation.
  const UNLIMITED = 9999;

  const credit = await prisma.videoCredit.upsert({
    where: { companyId_billingPeriodStart: { companyId, billingPeriodStart: periodStart } },
    update: {},
    create: {
      companyId,
      billingPeriodStart: periodStart,
      totalCredits: UNLIMITED,
      usedCredits: 0,
    },
  });

  return credit.totalCredits - credit.usedCredits;
}

export async function deductCredit(companyId: string, jobId: string): Promise<void> {
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);

  await prisma.videoCredit.updateMany({
    where: { companyId, billingPeriodStart: periodStart },
    data: { usedCredits: { increment: 1 } },
  });

  await prisma.videoJob.update({
    where: { id: jobId },
    data: { creditDeducted: true },
  });

  logger.info("[video-job] Credit deducted", { companyId, jobId });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function estimateRemainingTime(job: VideoJob): Promise<number | undefined> {
  if (job.status === "completed" || job.status === "error") return undefined;

  // Average of last 10 completed jobs
  const recent = await prisma.videoJob.findMany({
    where: { status: "completed", completedAt: { not: null }, startedAt: { not: null } },
    orderBy: { completedAt: "desc" },
    take: 10,
    select: { startedAt: true, completedAt: true },
  });

  if (recent.length === 0) return 300; // default 5 min estimate

  const avgMs =
    recent.reduce((sum, j) => {
      const ms = j.completedAt!.getTime() - j.startedAt!.getTime();
      return sum + ms;
    }, 0) / recent.length;

  const elapsedMs = job.startedAt
    ? Date.now() - job.startedAt.getTime()
    : 0;

  const remainingMs = Math.max(0, avgMs * ((100 - job.progress) / 100) - elapsedMs);
  return Math.round(remainingMs / 1000);
}

async function generateBrief(
  job: VideoJob,
  selectedFrameS3Keys: string[],
) {
  const company = await prisma.company.findUnique({
    where: { id: job.companyId },
    select: { name: true, sector: true, tone: true, colors: true },
  });

  const systemPrompt = `Você é um especialista em criação de vídeos de marketing para redes sociais.
Analise o contexto do negócio e gere um briefing completo para um vídeo de ${job.targetDuration} segundos.
Responda APENAS com JSON, sem markdown.`;

  const userMessage = `Negócio: ${company?.name ?? "Empresa"}
Setor: ${company?.sector ?? "Não informado"}
Tom: ${company?.tone ?? job.tone}
Contexto do vídeo: ${job.contextDescription}
Plataforma: ${job.platform}
Duração: ${job.targetDuration} segundos
Estilo visual: ${job.visualStyle}
CTA: ${job.ctaText ?? "Sem CTA específico"}
Frames disponíveis: ${selectedFrameS3Keys.length}

Gere o briefing no formato:
{
  "script": ["frase 1", "frase 2", "frase 3"],
  "framePrompts": [{"frameIndex": 0, "prompt": "prompt em inglês para Stable Diffusion"}, ...],
  "overlayTexts": [{"text": "texto curto", "startSeconds": 0}, ...],
  "musicCategory": "energetic|smooth|corporate|inspirational|upbeat"
}

Regras:
- script: array de frases que somam ${job.targetDuration} segundos de fala (120 palavras/min)
- framePrompts: um por frame (${selectedFrameS3Keys.length} frames), prompts em INGLÊS
- overlayTexts: máximo 3 textos, timestamps crescentes
- musicCategory: escolha baseada no tom e setor`;

  const result = await generateTextWithBedrock(job.companyId, systemPrompt, userMessage);
  const rawText = result.options?.[0]?.content ?? "";

  // Extract JSON
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("IA não retornou JSON válido para o briefing");
  }

  const parsed = JSON.parse(jsonMatch[0]) as {
    script?: unknown;
    framePrompts?: unknown;
    overlayTexts?: unknown;
    musicCategory?: unknown;
  };

  // Use a plain object to avoid type predicate narrowing issues
  const briefObj = {
    jobId: job.id,
    script: Array.isArray(parsed.script) ? (parsed.script as string[]) : [`${job.contextDescription}`],
    framePrompts: Array.isArray(parsed.framePrompts)
      ? (parsed.framePrompts as FramePrompt[])
      : selectedFrameS3Keys.map((_, i) => ({
          frameIndex: i,
          prompt: `professional marketing photo, ${job.visualStyle} style`,
        })),
    overlayTexts: Array.isArray(parsed.overlayTexts)
      ? (parsed.overlayTexts as OverlayText[])
      : [] as OverlayText[],
    musicCategory: ((parsed.musicCategory as string | undefined) ?? "corporate") as MusicCategory,
  };

  // Sanitize overlay timestamps
  briefObj.overlayTexts = briefObj.overlayTexts
    .filter((ot) => typeof ot.startSeconds === "number" && ot.startSeconds >= 0)
    .sort((a, b) => a.startSeconds - b.startSeconds)
    .reduce<OverlayText[]>((acc, ot) => {
      if (acc.length === 0 || ot.startSeconds > acc[acc.length - 1]!.startSeconds) {
        acc.push(ot);
      }
      return acc;
    }, []);

  const brief = briefObj;
  return brief;
}
