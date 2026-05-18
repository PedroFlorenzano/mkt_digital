/**
 * video-assembler.service.ts
 *
 * Two assembly modes driven by the `useAsInspiration` flag on VideoJob:
 *
 *  ┌─────────────────────────────────────────────────────────────────────┐
 *  │  useAsInspiration = true  (default)                                 │
 *  │  AI-generated frames → slideshow at target duration                 │
 *  │  Original video is NOT used in output; it only inspired the prompts │
 *  ├─────────────────────────────────────────────────────────────────────┤
 *  │  useAsInspiration = false                                           │
 *  │  Original video → professionally polished output                   │
 *  │  Cuts, colour-grade, crop-to-platform, narration + music overlay    │
 *  └─────────────────────────────────────────────────────────────────────┘
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
  /** AI-generated / style-transferred frame S3 keys */
  transformedFrameS3Keys: string[];
  /** S3 key of the original raw video (used when useAsInspiration = false) */
  rawVideoS3Key?: string;
  narrationS3Key: string;
  overlayTexts: OverlayText[];
  musicCategory: MusicCategory;
  /** Script sentences — used to derive subtitle timestamps reliably */
  script: string[];
  /**
   * true  = generate a new video from AI frames (original is inspiration only)
   * false = polish the original video (keep footage, apply professional edits)
   */
  useAsInspiration: boolean;
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
// assembleVideo — public entry point
// ---------------------------------------------------------------------------

export async function assembleVideo(
  config: AssemblyConfig,
): Promise<VideoGenerationResult> {
  const tmpDir = path.join(
    os.tmpdir(),
    `video-assemble-${config.jobId}-${crypto.randomBytes(4).toString("hex")}`,
  );
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    return config.useAsInspiration
      ? await assembleFromAIFrames(config, tmpDir)
      : await assembleFromOriginalVideo(config, tmpDir);
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* non-fatal */ }
  }
}

// ---------------------------------------------------------------------------
// Mode A — AI-styled frames with Ken Burns + crossfade
// ---------------------------------------------------------------------------

async function assembleFromAIFrames(
  config: AssemblyConfig,
  tmpDir: string,
): Promise<VideoGenerationResult> {
  const {
    jobId, platform, targetDurationSeconds,
    transformedFrameS3Keys, narrationS3Key,
    overlayTexts, musicCategory, script,
  } = config;

  const resolution = getResolution(platform);
  const [width, height] = resolution.split("x").map(Number) as [number, number];

  // 1. Download styled frames
  const frameDir = path.join(tmpDir, "frames");
  fs.mkdirSync(frameDir, { recursive: true });

  for (let i = 0; i < transformedFrameS3Keys.length; i++) {
    const buf = await downloadVideoArtifact(transformedFrameS3Keys[i]!);
    fs.writeFileSync(path.join(frameDir, `frame_${String(i).padStart(4, "0")}.jpg`), buf);
  }

  // 2. Download narration + music
  const narrationPath = path.join(tmpDir, "narration.mp3");
  fs.writeFileSync(narrationPath, await downloadVideoArtifact(narrationS3Key));
  const musicPath = path.join(getMusicDir(), MUSIC_FILES[musicCategory]);
  const hasMusicFile = fs.existsSync(musicPath);

  // 3. Subtitle timings derived from word count
  const timedOverlays = deriveSubtitleTimings(script, overlayTexts, targetDurationSeconds);

  // 4. Build one video clip per frame with Ken Burns (zoompan) + fade-in/out.
  //    Each clip fades in from black at the start and out to black at the end.
  //    This allows clean concat with a simple demuxer — no xfade complexFilter needed.
  const frameCount = transformedFrameS3Keys.length;
  const FPS = 25;
  const FADE_SEC = 0.35;                                   // fade duration per clip
  const secPerFrame = targetDurationSeconds / Math.max(frameCount, 1);
  const framesPerClip = Math.max(Math.round(secPerFrame * FPS), FPS); // min 1 s

  const clipPaths: string[] = [];

  for (let i = 0; i < frameCount; i++) {
    const framePath = path.join(frameDir, `frame_${String(i).padStart(4, "0")}.jpg`);
    const clipPath  = path.join(tmpDir,  `clip_${String(i).padStart(4, "0")}.mp4`);

    // Alternate zoom-in / zoom-out for variety
    const zoomIn   = i % 2 === 0;
    const zoomStart = zoomIn ? 1.0 : 1.05;
    const zoomEnd   = zoomIn ? 1.05 : 1.0;
    const zoomStep  = (zoomEnd - zoomStart) / Math.max(framesPerClip - 1, 1);
    const zoomExpr  = `${zoomStart.toFixed(4)}+${zoomStep.toFixed(6)}*on`;

    // Centre pan — gentle horizontal drift
    const driftPx = 8; // total pixels to drift across the clip
    const xBase   = `iw/2-(iw/zoom/2)`;
    const xExpr   = i % 2 === 0
      ? `${xBase}+(on/${framesPerClip})*${driftPx}`
      : `${xBase}+${driftPx}-(on/${framesPerClip})*${driftPx}`;
    const yExpr = `ih/2-(ih/zoom/2)`;

    const fadeInFrames  = Math.round(FADE_SEC * FPS);

    await new Promise<void>((resolve, reject) => {
      ffmpeg(framePath)
        .inputOptions(["-loop 1"])
        .videoFilters([
          // 2× oversample so zoompan has headroom
          `scale=${width * 2}:${height * 2}`,
          `zoompan=z='${zoomExpr}':x='${xExpr}':y='${yExpr}':d=${framesPerClip}:s=${width}x${height}:fps=${FPS}`,
          `fade=t=in:st=0:d=${FADE_SEC}`,
          `fade=t=out:st=${(framesPerClip / FPS - FADE_SEC).toFixed(3)}:d=${FADE_SEC}`,
          `format=yuv420p`,
        ])
        .outputOptions([
          `-t ${(framesPerClip / FPS).toFixed(6)}`,
          `-c:v libx264`, `-preset fast`, `-crf 20`,
          `-an`,
        ])
        .output(clipPath)
        .on("end", () => resolve())
        .on("error", (e: Error) => reject(new Error(`Ken Burns clip ${i} failed: ${e.message}`)))
        .run();
    });

    clipPaths.push(clipPath);
  }

  // 5. Concatenate clips with simple concat demuxer (robust, no xfade complexFilter)
  const concatListPath = path.join(tmpDir, "concat.txt");
  const concatLines = clipPaths.map(p => `file '${p.replace(/\\/g, "/")}'`);
  fs.writeFileSync(concatListPath, concatLines.join("\n"));

  const fadedVideoPath = path.join(tmpDir, "faded.mp4");
  await new Promise<void>((resolve, reject) => {
    ffmpeg()
      .input(concatListPath)
      .inputOptions(["-f concat", "-safe 0"])
      .outputOptions([
        "-c:v libx264", "-preset fast", "-crf 18",
        "-an",
        `-t ${targetDurationSeconds}`,
      ])
      .output(fadedVideoPath)
      .on("end", () => resolve())
      .on("error", (e: Error) => reject(new Error(`Concat failed: ${e.message}`)))
      .run();
  });

  // 6. Assemble: add narration, music, subtitles
  const outputPath = path.join(tmpDir, "output.mp4");
  const fontPath = findFontPath();
  const overlayFilter = buildOverlayFilter(timedOverlays, height, fontPath);

  await new Promise<void>((resolve, reject) => {
    let cmd = ffmpeg(fadedVideoPath).input(narrationPath);
    if (hasMusicFile) cmd = cmd.input(musicPath);

    const outputOptions = [
      "-c:v libx264", "-preset medium", "-b:v 4000k",
      "-c:a aac", "-b:a 128k",
      `-t ${targetDurationSeconds}`,
      "-movflags +faststart",
    ];

    if (overlayFilter) {
      // Apply subtitle overlay on video
      if (hasMusicFile) {
        cmd = cmd.complexFilter([
          `[0:v]${overlayFilter}[vout]`,
          `[1:a]volume=1.0[narr]`,
          `[2:a]volume=0.18,atrim=0:${targetDurationSeconds}[music]`,
          `[narr][music]amix=inputs=2:duration=first[aout]`,
        ]).outputOptions([...outputOptions, "-map [vout]", "-map [aout]"]);
      } else {
        cmd = cmd.complexFilter([
          `[0:v]${overlayFilter}[vout]`,
        ]).outputOptions([...outputOptions, "-map [vout]", "-map 1:a"]);
      }
    } else {
      if (hasMusicFile) {
        cmd = cmd.complexFilter([
          `[1:a]volume=1.0[narr]`,
          `[2:a]volume=0.18,atrim=0:${targetDurationSeconds}[music]`,
          `[narr][music]amix=inputs=2:duration=first[aout]`,
        ]).outputOptions([...outputOptions, "-map 0:v", "-map [aout]"]);
      } else {
        cmd = cmd.outputOptions([...outputOptions, "-map 0:v", "-map 1:a"]);
      }
    }

    cmd.output(outputPath)
      .on("end", () => resolve())
      .on("error", (e: Error) => reject(new Error(`Final assembly failed: ${e.message}`)))
      .run();
  });

  return uploadAndReturn(jobId, outputPath, resolution, targetDurationSeconds);
}

// ---------------------------------------------------------------------------
// Mode B — Polish the original video
// ---------------------------------------------------------------------------

async function assembleFromOriginalVideo(
  config: AssemblyConfig,
  tmpDir: string,
): Promise<VideoGenerationResult> {
  const {
    jobId, platform, targetDurationSeconds,
    rawVideoS3Key, narrationS3Key,
    overlayTexts, musicCategory, script,
  } = config;

  if (!rawVideoS3Key) {
    throw new Error("rawVideoS3Key is required when useAsInspiration = false");
  }

  const resolution = getResolution(platform);
  const [width, height] = resolution.split("x").map(Number) as [number, number];

  // 1. Download original video
  const rawVideoPath = path.join(tmpDir, "input_raw.mp4");
  const rawBuf = await downloadVideoArtifact(rawVideoS3Key);
  fs.writeFileSync(rawVideoPath, rawBuf);

  // 2. Download narration
  const narrationPath = path.join(tmpDir, "narration.mp3");
  fs.writeFileSync(narrationPath, await downloadVideoArtifact(narrationS3Key));

  // 3. Music
  const musicPath = path.join(getMusicDir(), MUSIC_FILES[musicCategory]);
  const hasMusicFile = fs.existsSync(musicPath);

  // 4. Subtitle timings
  const timedOverlays = deriveSubtitleTimings(script, overlayTexts, targetDurationSeconds);

  // 5. Assemble: keep original footage, apply professional colour grade + crop + narration
  const outputPath = path.join(tmpDir, "output.mp4");
  await runFfmpegPolish(
    rawVideoPath, narrationPath, hasMusicFile ? musicPath : null,
    outputPath, width, height, targetDurationSeconds,
    timedOverlays,
  );

  return uploadAndReturn(jobId, outputPath, resolution, targetDurationSeconds);
}

// ---------------------------------------------------------------------------
// ffmpeg helpers
// ---------------------------------------------------------------------------

async function runFfmpegPolish(
  rawVideoPath: string,
  narrationPath: string,
  musicPath: string | null,
  outputPath: string,
  width: number,
  height: number,
  targetDurationSeconds: number,
  overlayTexts: OverlayText[],
): Promise<void> {
  const fontPath = findFontPath();
  const overlayFilter = buildOverlayFilter(overlayTexts, height, fontPath);

  return new Promise<void>((resolve, reject) => {
    // Input 0: original video
    // Input 1: narration (replaces original audio at 30% vol)
    // Input 2 (optional): music
    let cmd = ffmpeg()
      .input(rawVideoPath)
      .input(narrationPath);

    if (musicPath) cmd = cmd.input(musicPath);

    // Professional colour grade + crop to target resolution
    const baseVideoFilter = [
      // Smart crop: centre-crop to target aspect ratio first
      `crop=in_w:min(in_h\\,in_w*${height}/${width})`,
      `scale=${width}:${height}:force_original_aspect_ratio=increase`,
      `crop=${width}:${height}`,
      // Colour grade: slight contrast boost + subtle saturation
      `eq=contrast=1.08:saturation=1.15:brightness=0.02`,
      `unsharp=3:3:0.5:3:3:0.0`,
      `fps=25`,
      `format=yuv420p`,
    ].join(",");

    const videoFilter = overlayFilter
      ? `${baseVideoFilter},${overlayFilter}`
      : baseVideoFilter;

    const outputOptions = [
      "-c:v libx264", "-preset medium", "-b:v 4000k",
      "-c:a aac", "-b:a 128k",
      `-t ${targetDurationSeconds}`,
      "-movflags +faststart",
    ];

    if (musicPath) {
      // Keep original audio at 10%, narration at 100%, music at 15%
      cmd = cmd
        .complexFilter([
          `[0:v]${videoFilter}[vout]`,
          `[0:a]volume=0.1[origaudio]`,
          `[1:a]volume=1.0[narr]`,
          `[2:a]volume=0.15,atrim=0:${targetDurationSeconds}[music]`,
          `[origaudio][narr][music]amix=inputs=3:duration=first[aout]`,
        ])
        .outputOptions([...outputOptions, "-map [vout]", "-map [aout]"]);
    } else {
      cmd = cmd
        .complexFilter([
          `[0:v]${videoFilter}[vout]`,
          `[0:a]volume=0.1[origaudio]`,
          `[1:a]volume=1.0[narr]`,
          `[origaudio][narr]amix=inputs=2:duration=first[aout]`,
        ])
        .outputOptions([...outputOptions, "-map [vout]", "-map [aout]"]);
    }

    cmd
      .output(outputPath)
      .on("end", () => resolve())
      .on("error", (err: Error) => reject(new Error(`ffmpeg polish failed: ${err.message}`)))
      .run();
  });
}

// ---------------------------------------------------------------------------
// Subtitle timing — derive from word count, not Claude's guessed timestamps
// ---------------------------------------------------------------------------

/**
 * Re-distributes subtitle timings based on actual word count of each script
 * sentence, instead of trusting Claude's guessed timestamps.
 *
 * Each `overlayText` is mapped 1:1 to a script sentence (by index).
 * If there are fewer overlays than sentences, only the first N sentences
 * get subtitles, spaced evenly.
 */
function deriveSubtitleTimings(
  script: string[],
  overlayTexts: OverlayText[],
  targetDurationSeconds: number,
): OverlayText[] {
  if (overlayTexts.length === 0 || script.length === 0) return overlayTexts;

  const totalWords = script.reduce(
    (sum, s) => sum + s.trim().split(/\s+/).filter(Boolean).length, 0,
  );

  // Cumulative word boundary → time position
  let cumulativeWords = 0;
  const sentenceStarts: number[] = script.map((s) => {
    const start = (cumulativeWords / Math.max(totalWords, 1)) * targetDurationSeconds;
    cumulativeWords += s.trim().split(/\s+/).filter(Boolean).length;
    return start;
  });

  return overlayTexts.map((ot, i) => ({
    ...ot,
    startSeconds: sentenceStarts[i] ?? sentenceStarts[sentenceStarts.length - 1] ?? 0,
  }));
}

// ---------------------------------------------------------------------------
// Upload and return result
// ---------------------------------------------------------------------------

async function uploadAndReturn(
  jobId: string,
  outputPath: string,
  resolution: string,
  targetDurationSeconds: number,
): Promise<VideoGenerationResult> {
  const stats = fs.statSync(outputPath);
  const fileSizeBytes = stats.size;
  const durationSeconds = await getVideoDuration(outputPath).catch(() => targetDurationSeconds);

  const prefix = buildJobS3Prefix(jobId);
  const outputS3Key = `${prefix}output/final.mp4`;
  await uploadVideoArtifact(outputS3Key, fs.readFileSync(outputPath), "video/mp4");

  logger.info("[video-assembler] Video assembled and uploaded", {
    jobId, outputS3Key, durationSeconds, fileSizeBytes, resolution,
  });

  return { jobId, outputS3Key, durationSeconds, fileSizeBytes, resolution, totalCostUsd: 0 };
}

// ---------------------------------------------------------------------------
// Misc helpers
// ---------------------------------------------------------------------------

function findFontPath(): string {
  const candidates = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
    "/Library/Fonts/Arial Bold.ttf",
    "C:/Windows/Fonts/arialbd.ttf",
    "C:/Windows/Fonts/arial.ttf",
  ];
  return candidates.find(fs.existsSync) ?? "";
}

function buildOverlayFilter(
  overlayTexts: OverlayText[],
  height: number,
  fontPath: string,
): string {
  if (overlayTexts.length === 0) return "";
  if (!fontPath) {
    logger.warn("[video-assembler] No system font found — skipping text overlays");
    return "";
  }

  const escapedFont = fontPath.replace(/\\/g, "/");

  return overlayTexts
    .map((ot, i) => {
      const nextStart = overlayTexts[i + 1]?.startSeconds ?? 9999;
      const escapedText = ot.text
        .replace(/\\/g, "\\\\\\\\")
        .replace(/:/g, "\\:")
        .replace(/'/g, "\\'");

      return (
        `drawtext=fontfile='${escapedFont}':` +
        `text='${escapedText}':` +
        `fontsize=40:fontcolor=white:` +
        `shadowcolor=black:shadowx=2:shadowy=2:` +
        `x=(w-text_w)/2:y=${Math.round(height * 0.82)}:` +
        `enable='between(t,${ot.startSeconds.toFixed(3)},${nextStart.toFixed(3)})'`
      );
    })
    .join(",");
}

function getVideoDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      resolve(metadata.format.duration ?? 0);
    });
  });
}

