/**
 * video-validations.ts
 *
 * Pure validation functions for the AI Video Generation module.
 * No side effects, no external dependencies — fully unit-testable.
 */

export type VideoPlatform = "instagram_reels" | "tiktok" | "youtube_shorts";
export type VideoVisualStyle = "realistic" | "cinematic" | "minimalist";
export type PollyVoice = "Camila" | "Ricardo";

/** Plans eligible for the Video module (exact, case-sensitive) */
const ELIGIBLE_PLANS = new Set(["Profissional", "Agencia"]);

/** Max file size: 500 MB in bytes */
export const MAX_VIDEO_FILE_SIZE_BYTES = 524_288_000;

/** Accepted MIME types for video upload */
const VALID_MIME_TYPES = new Set(["video/mp4", "video/quicktime", "video/webm"]);

/** Min / max video duration in seconds */
export const MIN_VIDEO_DURATION_SECONDS = 3;
export const MAX_VIDEO_DURATION_SECONDS = 600; // 10 min

/** Context description length limits */
export const MIN_CONTEXT_LENGTH = 10;
export const MAX_CONTEXT_LENGTH = 500;

/** Words per minute for pt-BR narration estimation */
const WORDS_PER_MINUTE = 120;

/** Tolerance in seconds for script duration validation */
const DURATION_TOLERANCE_SECONDS = 5;

// ---------------------------------------------------------------------------
// Access control
// ---------------------------------------------------------------------------

/**
 * Returns true if the plan name is eligible for the Video module.
 * Case-sensitive — only "Profissional" and "Agencia" are accepted.
 */
export function requireVideoAccess(planName: string): boolean {
  return ELIGIBLE_PLANS.has(planName);
}

/**
 * Returns true if the user has at least 1 video credit remaining.
 */
export function canGenerateVideo(creditBalance: number): boolean {
  return creditBalance > 0;
}

// ---------------------------------------------------------------------------
// Upload validation
// ---------------------------------------------------------------------------

/**
 * Returns true if the MIME type is an accepted video format.
 */
export function isValidVideoFormat(mimeType: string): boolean {
  return VALID_MIME_TYPES.has(mimeType);
}

/**
 * Returns true if both the file size and duration are within accepted limits.
 * - fileSizeBytes must be <= 500 MB (524_288_000)
 * - durationSeconds must be >= 3 and <= 600
 */
export function isValidVideoFile(
  fileSizeBytes: number,
  durationSeconds: number,
): boolean {
  return (
    fileSizeBytes > 0 &&
    fileSizeBytes <= MAX_VIDEO_FILE_SIZE_BYTES &&
    durationSeconds >= MIN_VIDEO_DURATION_SECONDS &&
    durationSeconds <= MAX_VIDEO_DURATION_SECONDS
  );
}

/**
 * Returns true if the context description length is within accepted bounds.
 * Range: 10 to 500 characters (inclusive).
 */
export function isValidContextDescription(s: string): boolean {
  return s.length >= MIN_CONTEXT_LENGTH && s.length <= MAX_CONTEXT_LENGTH;
}

// ---------------------------------------------------------------------------
// Platform / configuration helpers
// ---------------------------------------------------------------------------

/**
 * Maps a target platform to its video aspect ratio.
 * - instagram_reels → "9:16"
 * - tiktok          → "9:16"
 * - youtube_shorts  → "16:9"
 */
export function getAspectRatio(platform: VideoPlatform): "9:16" | "16:9" {
  if (platform === "youtube_shorts") return "16:9";
  return "9:16";
}

/**
 * Maps a platform to its output resolution.
 */
export function getResolution(
  platform: VideoPlatform,
): "1080x1920" | "1920x1080" {
  return getAspectRatio(platform) === "9:16" ? "1080x1920" : "1920x1080";
}

/**
 * Calculates frame extraction parameters based on video duration.
 * - interval: 1s for videos <= 60s, 2s for longer videos
 * - maxFrames: always 60
 */
export function calculateExtractionParams(durationSeconds: number): {
  interval: number;
  maxFrames: number;
} {
  return {
    interval: durationSeconds <= 60 ? 1 : 2,
    maxFrames: 60,
  };
}

// ---------------------------------------------------------------------------
// Script duration validation
// ---------------------------------------------------------------------------

/**
 * Returns true if the estimated narration duration of the script is within
 * ±5 seconds of the target duration.
 *
 * Estimation: (totalWords / 120) * 60 seconds (120 WPM for pt-BR)
 */
export function isScriptDurationValid(
  script: string[],
  targetSeconds: number,
): boolean {
  const totalWords = script.reduce(
    (sum, sentence) =>
      sum + sentence.trim().split(/\s+/).filter(Boolean).length,
    0,
  );
  const estimatedSeconds = (totalWords / WORDS_PER_MINUTE) * 60;
  return Math.abs(estimatedSeconds - targetSeconds) <= DURATION_TOLERANCE_SECONDS;
}
