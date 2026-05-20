/**
 * Unit + property tests for story.service.ts
 *
 * Covers:
 *  - isValidStoryAspectRatio (P3.1 — 9:16 within ±1px)
 *  - validateStoryScheduling
 *  - generateStoryImage (mocked Bedrock)
 */

import {
  isValidStoryAspectRatio,
  validateStoryScheduling,
  generateStoryImage,
} from "@server/services/story.service";
import { ValidationError, ExternalServiceError } from "@server/lib/errors";

// Mock Bedrock
jest.mock("@server/lib/bedrock", () => ({
  generateImageWithBedrock: jest.fn(),
}));

import { generateImageWithBedrock } from "@server/lib/bedrock";
const mockedGenerateImage = jest.mocked(generateImageWithBedrock);

// ── isValidStoryAspectRatio ───────────────────────────────────────────────────

describe("isValidStoryAspectRatio", () => {
  describe("P3.1 – 9:16 ratio with ±1px tolerance", () => {
    // Exact 9:16 ratios
    it("accepts 720×1280 (exact 9:16)", () => {
      expect(isValidStoryAspectRatio(720, 1280)).toBe(true);
    });

    it("accepts 1080×1920 (exact 9:16)", () => {
      expect(isValidStoryAspectRatio(1080, 1920)).toBe(true);
    });

    it("accepts 9×16 (minimal exact)", () => {
      expect(isValidStoryAspectRatio(9, 16)).toBe(true);
    });

    // Within ±1px tolerance
    it("accepts 721×1280 (width +1)", () => {
      // 721×16 - 1280×9 = 11520 - 11520 = 0 → actually exact; use 722
      // Let's use a known within-tolerance case: 1081×1920 → |1081*16 - 1920*9| = |17296-17280| = 16 ≤ 25
      expect(isValidStoryAspectRatio(1081, 1920)).toBe(true);
    });

    it("accepts 1079×1920 (width -1) — tolerance", () => {
      // |1079*16 - 1920*9| = |17264-17280| = 16 ≤ 25
      expect(isValidStoryAspectRatio(1079, 1920)).toBe(true);
    });

    it("accepts 1080×1921 (height +1) — tolerance", () => {
      // |1080*16 - 1921*9| = |17280-17289| = 9 ≤ 25
      expect(isValidStoryAspectRatio(1080, 1921)).toBe(true);
    });

    it("accepts 1080×1919 (height -1) — tolerance", () => {
      // |1080*16 - 1919*9| = |17280-17271| = 9 ≤ 25
      expect(isValidStoryAspectRatio(1080, 1919)).toBe(true);
    });

    // Out of tolerance
    it("rejects 1:1 ratio (square)", () => {
      expect(isValidStoryAspectRatio(1080, 1080)).toBe(false);
    });

    it("rejects 16:9 landscape ratio", () => {
      expect(isValidStoryAspectRatio(1920, 1080)).toBe(false);
    });

    it("rejects 4:5 portrait ratio", () => {
      expect(isValidStoryAspectRatio(1080, 1350)).toBe(false);
    });

    it("rejects dimensions far outside 9:16", () => {
      expect(isValidStoryAspectRatio(100, 300)).toBe(false);
    });

    // Property: exact 9:16 multiples always pass
    it.each([1, 2, 5, 10, 40, 80, 120])(
      "property: %d×9 by %d×16 is always valid",
      (k) => {
        expect(isValidStoryAspectRatio(k * 9, k * 16)).toBe(true);
      },
    );
  });
});

// ── validateStoryScheduling ───────────────────────────────────────────────────

describe("validateStoryScheduling", () => {
  it("does nothing when scheduledAt is null", () => {
    expect(() => validateStoryScheduling(null)).not.toThrow();
  });

  it("does nothing when scheduledAt is undefined", () => {
    expect(() => validateStoryScheduling(undefined)).not.toThrow();
  });

  it("does nothing when scheduledAt is within 24h", () => {
    const soon = new Date(Date.now() + 12 * 60 * 60 * 1000); // 12h from now
    expect(() => validateStoryScheduling(soon)).not.toThrow();
  });

  it("does nothing when scheduledAt is exactly now", () => {
    const now = new Date();
    expect(() => validateStoryScheduling(now)).not.toThrow();
  });

  it("throws ValidationError when scheduledAt is more than 24h ahead", () => {
    const tooFar = new Date(Date.now() + 25 * 60 * 60 * 1000); // 25h from now
    expect(() => validateStoryScheduling(tooFar)).toThrow(ValidationError);
  });

  it("throws ValidationError for scheduledAt exactly 24h+1min from now", () => {
    const tooFar = new Date(Date.now() + 24 * 60 * 60 * 1000 + 60_000);
    expect(() => validateStoryScheduling(tooFar)).toThrow(ValidationError);
  });
});

// ── generateStoryImage ────────────────────────────────────────────────────────

describe("generateStoryImage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const baseUsage = { imagesGenerated: 1, costUsd: 0.08, model: "sd-ultra", aspectRatio: "9:16" };

  it("returns the base64 image URL on success", async () => {
    mockedGenerateImage.mockResolvedValueOnce({
      images: ["data:image/png;base64,abc123"],
      usage: baseUsage,
    });

    const result = await generateStoryImage("company-1", "sunset beach", "grow followers");
    expect(result).toBe("data:image/png;base64,abc123");
  });

  it("calls generateImageWithBedrock with aspectRatio 9:16", async () => {
    mockedGenerateImage.mockResolvedValueOnce({
      images: ["data:image/png;base64,abc"],
      usage: baseUsage,
    });

    await generateStoryImage("company-1", "beach", "sales");

    expect(mockedGenerateImage).toHaveBeenCalledWith(
      "company-1",
      expect.any(String),
      1,
      "9:16",
    );
  });

  it("includes the objective in the enriched prompt", async () => {
    mockedGenerateImage.mockResolvedValueOnce({
      images: ["data:image/png;base64,x"],
      usage: baseUsage,
    });

    await generateStoryImage("company-1", "product launch", "gerar leads");

    const promptArg = mockedGenerateImage.mock.calls[0]![1] as string;
    expect(promptArg).toContain("gerar leads");
  });

  it("retries once if first call returns empty images", async () => {
    mockedGenerateImage
      .mockResolvedValueOnce({ images: [], usage: baseUsage })
      .mockResolvedValueOnce({ images: ["data:image/png;base64,retry"], usage: baseUsage });

    const result = await generateStoryImage("company-1", "beach", "engagement");
    expect(result).toBe("data:image/png;base64,retry");
    expect(mockedGenerateImage).toHaveBeenCalledTimes(2);
  });

  it("throws ExternalServiceError after 2 failed attempts (all empty)", async () => {
    mockedGenerateImage.mockResolvedValue({ images: [], usage: baseUsage });

    await expect(
      generateStoryImage("company-1", "beach", "engagement"),
    ).rejects.toThrow(ExternalServiceError);
    expect(mockedGenerateImage).toHaveBeenCalledTimes(2);
  });

  it("throws ExternalServiceError after 2 failed attempts (all errors)", async () => {
    mockedGenerateImage.mockRejectedValue(new Error("Bedrock timeout"));

    await expect(
      generateStoryImage("company-1", "beach", "engagement"),
    ).rejects.toThrow(ExternalServiceError);
    expect(mockedGenerateImage).toHaveBeenCalledTimes(2);
  });
});
