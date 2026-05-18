/**
 * Tests for video-validations.ts — pure functions, zero external deps.
 * These run fast and have no mocks.
 */

import {
  isValidVideoFormat,
  isValidVideoFile,
  isValidContextDescription,
  getAspectRatio,
  getResolution,
  calculateExtractionParams,
  isScriptDurationValid,
  MAX_VIDEO_FILE_SIZE_BYTES,
  MIN_VIDEO_DURATION_SECONDS,
  MAX_VIDEO_DURATION_SECONDS,
  MIN_CONTEXT_LENGTH,
  MAX_CONTEXT_LENGTH,
} from "../lib/video-validations";

// ─── isValidVideoFormat ───────────────────────────────────────────────────────

describe("isValidVideoFormat", () => {
  it.each(["video/mp4", "video/quicktime", "video/webm"])(
    "accepts %s",
    (mime) => expect(isValidVideoFormat(mime)).toBe(true),
  );

  it.each(["video/avi", "image/jpeg", "audio/mp3", "", "video/"])(
    "rejects %s",
    (mime) => expect(isValidVideoFormat(mime)).toBe(false),
  );
});

// ─── isValidVideoFile ────────────────────────────────────────────────────────

describe("isValidVideoFile", () => {
  it("accepts a file within bounds", () => {
    expect(isValidVideoFile(1024, 30)).toBe(true);
  });

  it("rejects size = 0", () => {
    expect(isValidVideoFile(0, 30)).toBe(false);
  });

  it("accepts size exactly at MAX", () => {
    expect(isValidVideoFile(MAX_VIDEO_FILE_SIZE_BYTES, 30)).toBe(true);
  });

  it("rejects size one byte over MAX", () => {
    expect(isValidVideoFile(MAX_VIDEO_FILE_SIZE_BYTES + 1, 30)).toBe(false);
  });

  it("accepts duration exactly at MIN", () => {
    expect(isValidVideoFile(1024, MIN_VIDEO_DURATION_SECONDS)).toBe(true);
  });

  it("rejects duration one second below MIN", () => {
    expect(isValidVideoFile(1024, MIN_VIDEO_DURATION_SECONDS - 1)).toBe(false);
  });

  it("accepts duration exactly at MAX", () => {
    expect(isValidVideoFile(1024, MAX_VIDEO_DURATION_SECONDS)).toBe(true);
  });

  it("rejects duration one second over MAX", () => {
    expect(isValidVideoFile(1024, MAX_VIDEO_DURATION_SECONDS + 1)).toBe(false);
  });
});

// ─── isValidContextDescription ───────────────────────────────────────────────

describe("isValidContextDescription", () => {
  it("rejects string with 9 chars (below MIN)", () => {
    expect(isValidContextDescription("a".repeat(9))).toBe(false);
  });

  it("accepts string with exactly MIN chars", () => {
    expect(isValidContextDescription("a".repeat(MIN_CONTEXT_LENGTH))).toBe(true);
  });

  it("accepts string with exactly MAX chars", () => {
    expect(isValidContextDescription("a".repeat(MAX_CONTEXT_LENGTH))).toBe(true);
  });

  it("rejects string with MAX + 1 chars", () => {
    expect(isValidContextDescription("a".repeat(MAX_CONTEXT_LENGTH + 1))).toBe(false);
  });

  it("accepts a typical description", () => {
    expect(
      isValidContextDescription("Garrafa térmica para academia, público 25-40 anos")
    ).toBe(true);
  });
});

// ─── getAspectRatio ───────────────────────────────────────────────────────────

describe("getAspectRatio", () => {
  it("returns 9:16 for instagram_reels", () => {
    expect(getAspectRatio("instagram_reels")).toBe("9:16");
  });

  it("returns 9:16 for tiktok", () => {
    expect(getAspectRatio("tiktok")).toBe("9:16");
  });

  it("returns 16:9 for youtube_shorts", () => {
    expect(getAspectRatio("youtube_shorts")).toBe("16:9");
  });
});

// ─── getResolution ───────────────────────────────────────────────────────────

describe("getResolution", () => {
  it("returns 1080x1920 for vertical platforms", () => {
    expect(getResolution("instagram_reels")).toBe("1080x1920");
    expect(getResolution("tiktok")).toBe("1080x1920");
  });

  it("returns 1920x1080 for youtube_shorts", () => {
    expect(getResolution("youtube_shorts")).toBe("1920x1080");
  });
});

// ─── calculateExtractionParams ───────────────────────────────────────────────

describe("calculateExtractionParams", () => {
  it("uses interval 1 for videos <= 60s", () => {
    expect(calculateExtractionParams(30).interval).toBe(1);
    expect(calculateExtractionParams(60).interval).toBe(1);
  });

  it("uses interval 2 for videos > 60s", () => {
    expect(calculateExtractionParams(61).interval).toBe(2);
    expect(calculateExtractionParams(600).interval).toBe(2);
  });

  it("always returns maxFrames = 60", () => {
    expect(calculateExtractionParams(30).maxFrames).toBe(60);
    expect(calculateExtractionParams(600).maxFrames).toBe(60);
  });
});

// ─── isScriptDurationValid ───────────────────────────────────────────────────

describe("isScriptDurationValid", () => {
  // 120 words / 120 WPM = 60 seconds
  const sixtySeconds = Array(120).fill("word").join(" ");
  const thirtySeconds = Array(60).fill("word").join(" ");

  it("accepts script whose duration is exactly on target", () => {
    expect(isScriptDurationValid([sixtySeconds], 60)).toBe(true);
  });

  it("accepts script within ±5s tolerance", () => {
    // 60 words = 30s, target 33s → diff = 3s ≤ 5s
    expect(isScriptDurationValid([thirtySeconds], 33)).toBe(true);
  });

  it("rejects script more than 5s shorter than target", () => {
    // 60 words = 30s, target 36s → diff = 6s > 5s
    expect(isScriptDurationValid([thirtySeconds], 36)).toBe(false);
  });

  it("rejects script more than 5s longer than target", () => {
    // 60 words = 30s, target 24s → diff = 6s > 5s
    expect(isScriptDurationValid([thirtySeconds], 24)).toBe(false);
  });

  it("handles multi-sentence arrays", () => {
    const sentence = Array(20).fill("word").join(" "); // 20 words = 10s each
    // 3 × 10s = 30s, target 30s → valid
    expect(isScriptDurationValid([sentence, sentence, sentence], 30)).toBe(true);
  });
});
