/**
 * narration.service.ts
 *
 * Generates MP3 narration from a script using Amazon Polly,
 * stores the audio in S3, and registers the cost.
 */

import { synthesizeSpeech, type PollyVoice } from "@server/lib/aws-polly";
import { uploadVideoArtifact, buildJobS3Prefix } from "@server/lib/s3-video";
import { prisma } from "@server/lib/prisma";
import { logger } from "@server/lib/logger";
import { ExternalServiceError } from "@server/lib/errors";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NarrationResult {
  /** S3 key of the generated MP3 */
  s3Key: string;
  /** Number of characters sent to Polly (for cost calculation) */
  characterCount: number;
  /** Estimated audio duration in seconds (words / 120 WPM × 60) */
  durationSeconds: number;
}

// ---------------------------------------------------------------------------
// generateNarration
// ---------------------------------------------------------------------------

/**
 * Concatenates the script sentences, calls Amazon Polly, stores the MP3
 * in S3, and logs the cost.
 *
 * @param jobId      VideoJob id (for S3 key + cost log)
 * @param companyId  Company id (for cost log)
 * @param script     Array of narration sentences from the AI brief
 * @param voice      Polly voice: "Camila" (female) or "Ricardo" (male)
 */
export async function generateNarration(
  jobId: string,
  companyId: string,
  script: string[],
  voice: PollyVoice,
): Promise<NarrationResult> {
  const text = script.join(" ").trim();

  if (!text) {
    throw new Error("[narration] Empty script — cannot generate narration");
  }

  logger.info("[narration] Starting narration generation", {
    jobId,
    voice,
    charCount: text.length,
  });

  // 1. Synthesise with Polly
  const audioBuffer = await synthesizeSpeech({
    voice,
    text,
    outputFormat: "mp3",
    sampleRate: "22050",
  });

  // 2. Upload to S3
  const prefix = buildJobS3Prefix(jobId);
  const s3Key = `${prefix}narration/audio.mp3`;

  try {
    await uploadVideoArtifact(s3Key, audioBuffer, "audio/mpeg");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("[narration] S3 upload failed after Polly success", err, { jobId, s3Key });
    // Do NOT update job status here — caller handles state
    throw new ExternalServiceError("AWS S3", `Narration S3 upload failed: ${message}`);
  }

  // 3. Estimate duration
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  const durationSeconds = (wordCount / 120) * 60;

  // 4. Log cost (Amazon Polly charges per character)
  try {
    await prisma.costLog.create({
      data: {
        companyId,
        videoJobId: jobId,
        type: "video_narration",
        model: "amazon.polly",
        inputTokens: text.length, // chars as "tokens" for display
        outputTokens: 0,
        images: 0,
        costUsd: text.length * 0.000004, // $4 per 1M chars (Polly standard)
        metadata: JSON.stringify({ voice, charCount: text.length }),
      },
    });
  } catch (costErr) {
    // Non-fatal — log and continue
    logger.error("[narration] Failed to write cost log", costErr, { jobId });
  }

  logger.info("[narration] Narration generated successfully", {
    jobId,
    s3Key,
    charCount: text.length,
    durationSeconds: durationSeconds.toFixed(1),
  });

  return {
    s3Key,
    characterCount: text.length,
    durationSeconds,
  };
}
