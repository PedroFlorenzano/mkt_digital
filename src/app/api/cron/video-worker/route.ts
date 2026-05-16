/**
 * GET /api/cron/video-worker
 *
 * Internal worker endpoint that processes the next queued VideoJob.
 * Protected by CRON_SECRET via timing-safe comparison.
 * Called fire-and-forget from POST /api/video/jobs.
 */

import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@server/lib/prisma";
import { runPipeline } from "@server/services/video-job.service";
import { logger } from "@server/lib/logger";

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  const cronSecret = process.env["CRON_SECRET"] ?? "";

  if (!authHeader || !timingSafeEqual(authHeader, `Bearer ${cronSecret}`)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    // Pick next queued job (FIFO)
    const job = await prisma.videoJob.findFirst({
      where: { status: "queued" },
      orderBy: { createdAt: "asc" },
    });

    if (!job) {
      return NextResponse.json({ processed: false }, { status: 200 });
    }

    logger.info("[video-worker] Processing job", { jobId: job.id });

    // Run pipeline (this may take minutes)
    await runPipeline(job.id);

    const finalJob = await prisma.videoJob.findUnique({
      where: { id: job.id },
      select: { status: true },
    });

    return NextResponse.json(
      { processed: true, jobId: job.id, finalStatus: finalJob?.status ?? "unknown" },
      { status: 200 },
    );
  } catch (err) {
    logger.error("[video-worker] Unhandled error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
