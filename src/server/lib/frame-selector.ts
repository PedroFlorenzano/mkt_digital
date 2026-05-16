/**
 * frame-selector.ts
 *
 * Pure utility for selecting representative frames from a video.
 * Uses histogram difference to find visually diverse frames.
 * No external dependencies — fully testable without AWS or ffmpeg.
 */

export interface FrameHistogram {
  frameIndex: number;
  s3Key: string;
  /** 256-bin luminance histogram (values 0–1, summing to 1) */
  histogram: number[];
}

/**
 * Computes the sum of absolute differences between two histograms.
 * Returns 0 for identical histograms, up to 2.0 for completely opposite.
 */
export function histogramDiff(a: number[], b: number[]): number {
  const len = Math.max(a.length, b.length);
  let diff = 0;
  for (let i = 0; i < len; i++) {
    diff += Math.abs((a[i] ?? 0) - (b[i] ?? 0));
  }
  return diff;
}

/**
 * Selects up to `maxFrames` representative frames from the input list,
 * maximising visual diversity using cumulative histogram difference.
 *
 * Invariants guaranteed:
 * - result.length <= maxFrames
 * - result.length <= frames.length
 * - Every element of result is a reference from the input `frames` array
 * - The first and last frames of the input are always included (when n >= 2)
 *
 * @param frames     All extracted frames with precomputed histograms
 * @param maxFrames  Maximum number of frames to select (default 10)
 */
export function selectRepresentativeFrames(
  frames: FrameHistogram[],
  maxFrames = 10,
): FrameHistogram[] {
  if (frames.length === 0) return [];
  if (frames.length <= maxFrames) return [...frames];

  // Always include first and last
  const first = frames[0]!;
  const last = frames[frames.length - 1]!;

  if (maxFrames === 1) return [first];
  if (maxFrames === 2) return [first, last];

  // Remaining budget after reserving first and last
  const budget = maxFrames - 2;
  const middle = frames.slice(1, frames.length - 1);

  // Score each middle frame by its difference from its predecessor
  const scored = middle.map((frame, idx) => {
    const prev = frames[idx]!; // idx+1-1 = idx in original
    return {
      frame,
      diff: histogramDiff(prev.histogram, frame.histogram),
    };
  });

  // Sort by highest difference (most visually distinct)
  scored.sort((a, b) => b.diff - a.diff);

  // Take top `budget` by difference, then restore original order
  const selected = scored.slice(0, budget).map((s) => s.frame);
  const selectedIndices = new Set(selected.map((f) => f.frameIndex));

  const ordered = frames.filter(
    (f) =>
      f.frameIndex === first.frameIndex ||
      f.frameIndex === last.frameIndex ||
      selectedIndices.has(f.frameIndex),
  );

  return ordered;
}
