/**
 * video-assembler.service.ts
 *
 * Assembles the final marketing video from:
 *   - Transformed frames (downloaded from S3)
 *   - Narration MP3 (Amazon Polly output)
 *   - Background music track (royalty-free, from public/audio/music/)
 *   - Overlay text (rendered via ffmpeg drawtext filter)
 *
 * Output: H.264/AAC MP4 at 4 Mbps, aspect ratio per platform.
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
import { getResolution } from "@server/lib/video-validations";
import type { VideoPlatform } from "@server/lib/video-validations";
import type { OverlayText, MusicCategory } from "@server/lib/video-brief";
import { logger } from "@server/lib/logger";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MUSIC_FILES: Record<MusicCategory, string> = {
  energetic: "energetic-upbeat.mp3",
  smooth: "smooth-corporate.mp3",
  corporate: "corporate-professional.mp3",
  inspirational: "inspirational-rise.mp3",
  upbeat: "upbeat-modern.mp3",
};

// Attempt to locate the music directory relative to the project root
function getMusicDir(): string {
  const candidates = [
    path.join(process.cwd(), "public", "audio", "music"),
    path.join(process.cwd(), "..", "public", "audio", "music"),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }
  return candidates[0]!;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AssemblyConfig {
  jobId: string;
  companyId: string;
  platform: VideoPlatform;
  targetDurationSeconds: number;
  transformedFrameS3Keys: string[];
  narrationS3Key: string;
  overlayTexts: OverlayText[];
  musicCategory: MusicCategory;
}

export interface VideoGenerationResult {
  jobId: string;
  outputS3Key: string;
  durationSeconds: number;
  fileSizeBytes: number;
  resolution: string;
  totalCostUsd: number;
}

// ---------------------------------------------------------------------------
// assembleVideo
// ---------------------------------------------------------------------------

/**
 * Downloads all required artefacts, assembles the final MP4, uploads it to
 * S3, and returns the result metadata.
 */
export async function assembleVideo(
  config: AssemblyConfig,
): Promise<VideoGenerationResult> {
  const {
    jobId,
    platform,
    targetDurationSeconds,
    transformedFrameS3Keys,
    narrationS3Key,
    overlayTexts,
    musicCategory,
  } = config;

  const tmpDir = path.join(
    os.tmpdir(),
    `video-assemble-${jobId}-${crypto.randomBytes(4).toString("hex")}`,
  );
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    const resolution = getResolution(platform);
    const [width, height] = resolution.split("x").map(Number) as [number, number];

    // 1. Download all transformed frames
    logger.info("[video-assembler] Downloading frames", {
      jobId,
      count: transformedFrameS3Keys.length,
    });

    const frameDir = path.join(tmpDir, "frames");
    fs.mkdirSync(frameDir, { recursive: true });

    for (let i = 0; i < transformedFrameS3Keys.length; i++) {
      const s3Key = transformedFrameS3Keys[i]!;
      const buf = await downloadVideoArtifact(s3Key);
      fs.writeFileSync(path.join(frameDir, `frame_${String(i).padStart(4, "0")}.jpg`), buf);
    }

    // 2. Download narration
    const narrationPath = path.join(tmpDir, "narration.mp3");
    const narrationBuf = await downloadVideoArtifact(narrationS3Key);
    fs.writeFileSync(narrationPath, narrationBuf);

    // 3. Find background music
    const musicDir = getMusicDir();
    const musicFile = MUSIC_FILES[musicCategory];
    const musicPath = path.join(musicDir, musicFile);
    const hasMusicFile = fs.existsSync(musicPath);

    if (!hasMusicFile) {
      logger.warn("[video-assembler] Music file not found, skipping background track", {
        musicPath,
      });
    }

    // 4. Build frame list file for ffmpeg concat
    const framePattern = path.join(frameDir, "frame_%04d.jpg");
    const outputPath = path.join(tmpDir, "output.mp4");

    // Calculate fps from frame count and target duration
    const fps = Math.max(
      1,
      Math.round(transformedFrameS3Keys.length / targetDurationSeconds),
    );

    // 5. Build overlay text filter chain
    const overlayFilter = buildOverlayFilter(overlayTexts, width, height);

    // 6. Assemble with ffmpeg
    await new Promise<void>((resolve, reject) => {
      let cmd = ffmpeg()
        .input(framePattern)
        .inputOptions([`-framerate ${fps}`]);

      if (hasMusicFile) {
        cmd = cmd.input(narrationPath).input(musicPath);
      } else {
        cmd = cmd.input(narrationPath);
      }

      const videoFilters: string[] = [
        `scale=${width}:${height}:force_original_aspect_ratio=decrease`,
        `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black`,
        `format=yuv420p`,
      ];

      if (overlayFilter) {
        videoFilters.push(overlayFilter);
      }

      const outputOptions = [
        "-c:v libx264",
        "-preset medium",
        "-b:v 4000k",
        "-c:a aac",
        "-b:a 128k",
        `-t ${targetDurationSeconds}`,
        "-movflags +faststart",
      ];

      if (hasMusicFile) {
        // Mix narration (full volume) + music (20%)
        cmd = cmd
          .complexFilter([
            ...videoFilters.map((f, i) => (i === 0 ? `[0:v]${f}` : f)),
            `[1:a]volume=1.0[narr]`,
            `[2:a]volume=0.2[music]`,
            `[narr][music]amix=inputs=2:duration=first[aout]`,
          ])
          .outputOptions([...outputOptions, `-map [v]`, `-map [aout]`]);
      } else {
        cmd = cmd
          .videoFilters(videoFilters)
          .outputOptions([...outputOptions, "-map 0:v", "-map 1:a"]);
      }

      cmd
        .output(outputPath)
        .on("end", () => resolve())
        .on("error", (err: Error) => reject(new Error(`ffmpeg assembly failed: ${err.message}`)))
        .run();
    });

    // 7. Verify output and get stats
    const stats = fs.statSync(outputPath);
    const fileSizeBytes = stats.size;

    // Get actual duration with ffprobe
    const durationSeconds = await getVideoDuration(outputPath).catch(
      () => targetDurationSeconds,
    );

    // 8. Upload final video to S3
    const prefix = buildJobS3Prefix(jobId);
    const outputS3Key = `${prefix}output/final.mp4`;
    const videoBuffer = fs.readFileSync(outputPath);
    await uploadVideoArtifact(outputS3Key, videoBuffer, "video/mp4");

    logger.info("[video-assembler] Video assembled and uploaded", {
      jobId,
      outputS3Key,
      durationSeconds,
      fileSizeBytes,
      resolution,
    });

    return {
      jobId,
      outputS3Key,
      durationSeconds,
      fileSizeBytes,
      resolution,
      totalCostUsd: 0, // ffmpeg is free; individual costs already logged
    };
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch { /* non-fatal */ }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildOverlayFilter(
  overlayTexts: OverlayText[],
  _width: number,
  height: number,
): string {
  if (overlayTexts.length === 0) return "";

  // Build drawtext filter for each overlay
  const filters = overlayTexts.map((ot, i) => {
    const nextStart = overlayTexts[i + 1]?.startSeconds ?? 9999;
    // Escape special characters for ffmpeg
    const escapedText = ot.text
      .replace(/\\/g, "\\\\\\\\")
      .replace(/:/g, "\\:")
      .replace(/'/g, "\\'");

    return (
      `drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:` +
      `text='${escapedText}':` +
      `fontsize=42:fontcolor=white:` +
      `shadowcolor=black:shadowx=2:shadowy=2:` +
      `x=(w-text_w)/2:y=${Math.round(height * 0.8)}:` +
      `enable='between(t,${ot.startSeconds},${nextStart})'`
    );
  });

  return filters.join(",");
}

function getVideoDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      resolve(metadata.format.duration ?? 0);
    });
  });
}
