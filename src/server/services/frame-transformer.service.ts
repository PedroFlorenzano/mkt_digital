/**
 * frame-transformer.service.ts
 *
 * Transforms extracted video frames into marketing-quality images using
 * Stable Diffusion Ultra via AWS Bedrock (image-to-image mode).
 * Falls back to the original frame after 2 consecutive failures.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as crypto from "node:crypto";
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import {
  downloadVideoArtifact,
  uploadVideoArtifact,
  buildJobS3Prefix,
} from "@server/lib/s3-video";
import { prisma } from "@server/lib/prisma";
import { logger } from "@server/lib/logger";
import { isDevMode, buildLocalJobKey } from "@server/lib/local-storage";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_FRAMES_TO_TRANSFORM = 30;
const MAX_RETRIES = 2;
const SD_STRENGTH = 0.65; // preserve original content while applying marketing style
const IMAGE_REGION = process.env["AWS_BEDROCK_IMAGE_REGION"] ?? "us-west-2";
const SD_MODEL_ID = "stability.stable-image-ultra-v1:1";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FrameTransformInput {
  frameIndex: number;
  s3Key: string;
  prompt: string;
}

export interface FrameTransformResult {
  frameIndex: number;
  s3Key: string;
  usedFallback: boolean;
  costUsd: number;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

let _bedrockClient: BedrockRuntimeClient | null = null;

function getBedrockClient(): BedrockRuntimeClient {
  if (!_bedrockClient) {
    _bedrockClient = new BedrockRuntimeClient({ region: IMAGE_REGION });
  }
  return _bedrockClient;
}

// ---------------------------------------------------------------------------
// transformFrames
// ---------------------------------------------------------------------------

/**
 * Transforms up to MAX_FRAMES_TO_TRANSFORM frames using Stable Diffusion Ultra.
 * Falls back to the original frame after 2 failures per frame.
 * Registers cost in CostLog for each successful Stable Diffusion call.
 */
export async function transformFrames(
  jobId: string,
  companyId: string,
  frames: FrameTransformInput[],
  visualStyle: string,
): Promise<FrameTransformResult[]> {
  const prefix = buildJobS3Prefix(jobId);
  const toProcess = frames.slice(0, MAX_FRAMES_TO_TRANSFORM);
  const results: FrameTransformResult[] = [];

  for (const frame of toProcess) {
    const result = await transformSingleFrame(
      jobId,
      companyId,
      frame,
      visualStyle,
      prefix,
    );
    results.push(result);
  }

  logger.info("[frame-transformer] All frames processed", {
    jobId,
    total: toProcess.length,
    fallbacks: results.filter((r) => r.usedFallback).length,
  });

  return results;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function transformSingleFrame(
  jobId: string,
  companyId: string,
  frame: FrameTransformInput,
  visualStyle: string,
  s3Prefix: string,
): Promise<FrameTransformResult> {
  const outS3Key = isDevMode()
    ? buildLocalJobKey(jobId, `transformed/frame_${String(frame.frameIndex).padStart(4, "0")}.jpg`)
    : `${s3Prefix}transformed/frame_${String(frame.frameIndex).padStart(4, "0")}.jpg`;
  const tmpDir = path.join(os.tmpdir(), `tx-${jobId}-${frame.frameIndex}-${crypto.randomBytes(4).toString("hex")}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    // Download original frame
    const originalBuffer = await downloadVideoArtifact(frame.s3Key);

    let transformedBuffer: Buffer | null = null;
    let costUsd = 0;

    // Try up to MAX_RETRIES times
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const result = await callStableDiffusion(
          originalBuffer,
          frame.prompt,
          visualStyle,
        );
        transformedBuffer = result.imageBuffer;
        costUsd = result.costUsd;

        // Log cost
        await prisma.costLog.create({
          data: {
            companyId,
            videoJobId: jobId,
            type: "video_transform",
            model: SD_MODEL_ID,
            inputTokens: 0,
            outputTokens: 0,
            images: 1,
            costUsd,
            metadata: JSON.stringify({ frameIndex: frame.frameIndex }),
          },
        }).catch(() => {}); // non-fatal

        break;
      } catch (err) {
        logger.warn(`[frame-transformer] Attempt ${attempt + 1} failed for frame ${frame.frameIndex}`, {
          jobId,
          error: err instanceof Error ? err.message : String(err),
        });
        if (attempt === MAX_RETRIES - 1) {
          transformedBuffer = null; // will use fallback
        }
      }
    }

    const usedFallback = transformedBuffer === null;
    const finalBuffer = usedFallback ? originalBuffer : transformedBuffer!;

    // Upload to S3
    await uploadVideoArtifact(outS3Key, finalBuffer, "image/jpeg");

    if (usedFallback) {
      logger.info("[frame-transformer] Using fallback (original) for frame", {
        jobId,
        frameIndex: frame.frameIndex,
      });
    }

    return { frameIndex: frame.frameIndex, s3Key: outS3Key, usedFallback, costUsd };
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch { /* non-fatal */ }
  }
}

async function callStableDiffusion(
  imageBuffer: Buffer,
  prompt: string,
  visualStyle: string,
): Promise<{ imageBuffer: Buffer; costUsd: number }> {
  const client = getBedrockClient();

  const body = JSON.stringify({
    prompt: `${prompt}, ${visualStyle} style, professional marketing photography, high quality, 4k`,
    negative_prompt: "blurry, low quality, text, watermark, distorted",
    init_image: imageBuffer.toString("base64"),
    image_strength: 1 - SD_STRENGTH, // Bedrock uses image_strength as the amount to preserve
    cfg_scale: 7,
    steps: 30,
  });

  const command = new InvokeModelCommand({
    modelId: SD_MODEL_ID,
    contentType: "application/json",
    accept: "application/json",
    body: Buffer.from(body),
  });

  const response = await client.send(command);
  const responseBody = JSON.parse(Buffer.from(response.body).toString()) as {
    artifacts?: Array<{ base64: string }>;
    images?: string[];
  };

  const base64 =
    responseBody.artifacts?.[0]?.base64 ??
    responseBody.images?.[0];

  if (!base64) {
    throw new Error("Stable Diffusion returned no image");
  }

  const imageData = Buffer.from(base64, "base64");

  // Stable Diffusion Ultra pricing: ~$0.008 per image
  const costUsd = 0.008;

  return { imageBuffer: imageData, costUsd };
}
