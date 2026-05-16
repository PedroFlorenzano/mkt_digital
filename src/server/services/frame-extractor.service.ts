/**
 * frame-extractor.service.ts
 *
 * Extracts frames from a raw video stored in S3 using fluent-ffmpeg.
 * Uploads the extracted JPEG frames back to S3 and selects a representative
 * subset for AI analysis using histogram-based diversity scoring.
 */

import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import * as crypto from "node:crypto";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import {
  downloadVideoArtifact,
  uploadVideoArtifact,
  buildJobS3Prefix,
} from "@server/lib/s3-video";
import {
  calculateExtractionParams,
} from "@server/lib/video-validations";
import {
  selectRepresentativeFrames,
  type FrameHistogram,
} from "@server/lib/frame-selector";
import { logger } from "@server/lib/logger";

// Set ffmpeg binary path
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FrameExtractionResult {
  /** Total frames extracted from the raw video */
  totalFrames: number;
  /** Indices of frames selected for AI processing (up to 10) */
  selectedFrames: number[];
  /** Extraction interval in seconds (1 or 2) */
  extractionInterval: number;
  /** S3 keys of all extracted frames */
  s3Keys: string[];
  /** S3 keys of only the selected representative frames */
  selectedS3Keys: string[];
}

// ---------------------------------------------------------------------------
// extractFrames
// ---------------------------------------------------------------------------

/**
 * Downloads a raw video from S3, extracts frames at regular intervals with
 * ffmpeg, uploads each frame JPEG to S3, then returns metadata including
 * which frames were selected as representative.
 *
 * @param jobId            VideoJob id (for S3 key prefixing)
 * @param rawS3Key         S3 key of the raw video file
 * @param durationSeconds  Video duration in seconds
 */
export async function extractFrames(
  jobId: string,
  rawS3Key: string,
  durationSeconds: number,
): Promise<FrameExtractionResult> {
  const tmpDir = path.join(os.tmpdir(), `video-job-${jobId}-${crypto.randomBytes(4).toString("hex")}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  const rawVideoPath = path.join(tmpDir, "input.mp4");
  const framesDir = path.join(tmpDir, "frames");
  fs.mkdirSync(framesDir, { recursive: true });

  const prefix = buildJobS3Prefix(jobId);

  try {
    // 1. Download raw video
    logger.info("[frame-extractor] Downloading raw video", { jobId, rawS3Key });
    const rawBuffer = await downloadVideoArtifact(rawS3Key);
    fs.writeFileSync(rawVideoPath, rawBuffer);

    // 2. Calculate extraction parameters
    const { interval, maxFrames } = calculateExtractionParams(durationSeconds);

    // 3. Extract frames with ffmpeg
    await new Promise<void>((resolve, reject) => {
      ffmpeg(rawVideoPath)
        .outputOptions([
          `-vf fps=1/${interval}`,
          `-vframes ${maxFrames}`,
          "-q:v 2", // JPEG quality (2 = best ~90%)
        ])
        .output(path.join(framesDir, "frame_%04d.jpg"))
        .on("end", () => resolve())
        .on("error", (err: Error) => reject(new Error(`ffmpeg extraction failed: ${err.message}`)))
        .run();
    });

    // 4. Collect extracted frames
    const frameFiles = fs
      .readdirSync(framesDir)
      .filter((f) => f.endsWith(".jpg"))
      .sort();

    if (frameFiles.length === 0) {
      throw new Error("vídeo inválido ou corrompido — nenhum frame extraído");
    }

    logger.info("[frame-extractor] Frames extracted", {
      jobId,
      count: frameFiles.length,
      interval,
    });

    // 5. Upload frames to S3 and build histogram data (simplified — use uniform histograms
    //    since we don't have OpenCV; diversity is approximated by frame index spread)
    const s3Keys: string[] = [];
    const histograms: FrameHistogram[] = [];

    for (let i = 0; i < frameFiles.length; i++) {
      const frameFile = frameFiles[i]!;
      const framePath = path.join(framesDir, frameFile);
      const frameBuffer = fs.readFileSync(framePath);
      const s3Key = `${prefix}frames/frame_${String(i).padStart(4, "0")}.jpg`;

      await uploadVideoArtifact(s3Key, frameBuffer, "image/jpeg");
      s3Keys.push(s3Key);

      // Build a simple pseudo-histogram based on file size variation
      // (approximates visual complexity without pixel-level processing)
      const normalizedSize = frameBuffer.length / 200_000; // normalise ~0-2
      const histogram = Array(256).fill(0) as number[];
      // Spread the "energy" across bins based on size and position
      for (let bin = 0; bin < 256; bin++) {
        histogram[bin] = (Math.sin((bin / 256) * Math.PI * (normalizedSize + 1)) + 1) / 512;
      }

      histograms.push({ frameIndex: i, s3Key, histogram });
    }

    // 6. Select representative subset
    const MAX_REPRESENTATIVE = 10;
    const selected = selectRepresentativeFrames(histograms, MAX_REPRESENTATIVE);
    const selectedFrames = selected.map((f) => f.frameIndex);
    const selectedS3Keys = selected.map((f) => f.s3Key);

    logger.info("[frame-extractor] Representative frames selected", {
      jobId,
      totalFrames: frameFiles.length,
      selectedCount: selected.length,
    });

    return {
      totalFrames: frameFiles.length,
      selectedFrames,
      extractionInterval: interval,
      s3Keys,
      selectedS3Keys,
    };
  } finally {
    // Clean up temp directory
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // non-fatal
    }
  }
}
