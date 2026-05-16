/**
 * video-brief.ts
 *
 * Serialization, deserialization and validation of the VideoPipelineBrief —
 * the canonical JSON artefact produced by the AI analysis step and consumed
 * by subsequent pipeline stages.
 *
 * All functions are pure (no side effects).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OverlayText {
  /** Display text, max 80 characters */
  text: string;
  /** Seconds from video start when the text appears (>= 0, monotonically increasing) */
  startSeconds: number;
}

export interface FramePrompt {
  frameIndex: number;
  /** Stable Diffusion prompt for transforming this frame */
  prompt: string;
}

export type MusicCategory =
  | "energetic"
  | "smooth"
  | "corporate"
  | "inspirational"
  | "upbeat";

/**
 * The canonical artefact stored in S3 as brief.json after the AI analysis step.
 */
export interface VideoPipelineBrief {
  jobId: string;
  /** Narration sentences (to be joined and sent to Amazon Polly) */
  script: string[];
  /** One prompt per selected frame for Stable Diffusion transformation */
  framePrompts: FramePrompt[];
  /** Up to 5 overlay texts with timestamps */
  overlayTexts: OverlayText[];
  /** Background music category */
  musicCategory: MusicCategory;
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

/**
 * Serializes a VideoPipelineBrief to a canonical JSON string.
 * Uses JSON.stringify with stable key ordering via replacer.
 */
export function serializeBrief(brief: VideoPipelineBrief): string {
  return JSON.stringify(brief);
}

/**
 * Deserializes a JSON string to a VideoPipelineBrief.
 * Validates structure; throws on invalid input.
 *
 * @throws {Error} if the JSON is malformed or required fields are missing/wrong type
 */
export function deserializeBrief(json: string): VideoPipelineBrief {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("[video-brief] Failed to parse JSON: malformed input");
  }

  if (!validateBrief(parsed)) {
    throw new Error(
      "[video-brief] Parsed object does not conform to VideoPipelineBrief schema",
    );
  }

  return parsed;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const VALID_MUSIC_CATEGORIES: ReadonlySet<string> = new Set([
  "energetic",
  "smooth",
  "corporate",
  "inspirational",
  "upbeat",
]);

/**
 * Type guard — returns true if `obj` is a valid VideoPipelineBrief.
 * Checks presence and type of all required fields.
 */
export function validateBrief(obj: unknown): obj is VideoPipelineBrief {
  if (!obj || typeof obj !== "object") return false;
  const b = obj as Record<string, unknown>;

  // jobId
  if (typeof b.jobId !== "string" || !b.jobId.trim()) return false;

  // script
  if (!Array.isArray(b.script)) return false;
  for (const s of b.script as unknown[]) {
    if (typeof s !== "string") return false;
  }

  // framePrompts
  if (!Array.isArray(b.framePrompts)) return false;
  for (const fp of b.framePrompts as unknown[]) {
    if (!fp || typeof fp !== "object") return false;
    const f = fp as Record<string, unknown>;
    if (typeof f.frameIndex !== "number") return false;
    if (typeof f.prompt !== "string") return false;
  }

  // overlayTexts
  if (!Array.isArray(b.overlayTexts)) return false;
  for (const ot of b.overlayTexts as unknown[]) {
    if (!ot || typeof ot !== "object") return false;
    const o = ot as Record<string, unknown>;
    if (typeof o.text !== "string") return false;
    if (typeof o.startSeconds !== "number") return false;
  }

  // musicCategory
  if (
    typeof b.musicCategory !== "string" ||
    !VALID_MUSIC_CATEGORIES.has(b.musicCategory)
  ) {
    return false;
  }

  // Validate overlay timestamp invariants
  if (!validateOverlayTimestamps(b.overlayTexts as OverlayText[])) return false;

  return true;
}

/**
 * Validates that overlay timestamps are non-negative and monotonically increasing.
 * Returns true for empty arrays.
 */
export function validateOverlayTimestamps(overlayTexts: OverlayText[]): boolean {
  for (let i = 0; i < overlayTexts.length; i++) {
    const entry = overlayTexts[i];
    if (!entry) return false;
    if (entry.startSeconds < 0) return false;
    if (i > 0) {
      const prev = overlayTexts[i - 1]!;
      if (entry.startSeconds <= prev.startSeconds) return false;
    }
  }
  return true;
}
