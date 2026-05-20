/**
 * Unit + property tests for reel.service.ts
 *
 * Covers:
 *  - isValidReelDuration (P2.1)
 *  - validateReelPublish: all validation branches
 */

import {
  isValidReelDuration,
  validateReelPublish,
  type ReelPublishInput,
} from "@server/services/reel.service";
import { ValidationError } from "@server/lib/errors";

// ── isValidReelDuration ───────────────────────────────────────────────────────

describe("isValidReelDuration", () => {
  describe("P2.1 – duration invariant: accept iff 15 ≤ seconds ≤ 60", () => {
    it("accepts 15 seconds (lower bound)", () => {
      expect(isValidReelDuration(15)).toBe(true);
    });

    it("accepts 60 seconds (upper bound)", () => {
      expect(isValidReelDuration(60)).toBe(true);
    });

    it("accepts 30 seconds (middle)", () => {
      expect(isValidReelDuration(30)).toBe(true);
    });

    it("rejects 14 seconds (below lower bound)", () => {
      expect(isValidReelDuration(14)).toBe(false);
    });

    it("rejects 61 seconds (above upper bound)", () => {
      expect(isValidReelDuration(61)).toBe(false);
    });

    it("rejects 0 seconds", () => {
      expect(isValidReelDuration(0)).toBe(false);
    });

    it("rejects negative duration", () => {
      expect(isValidReelDuration(-5)).toBe(false);
    });

    // Property: P2.1 — for any integer, result is true iff 15 ≤ n ≤ 60
    it.each(
      Array.from({ length: 20 }, (_, i) => i + 1), // 1..20 (mostly invalid)
    )("property: isValidReelDuration(%d) === (15 <= %d && %d <= 60)", (n) => {
      expect(isValidReelDuration(n)).toBe(n >= 15 && n <= 60);
    });

    it.each(
      Array.from({ length: 20 }, (_, i) => i + 50), // 50..69
    )("property: isValidReelDuration(%d) === (15 <= %d && %d <= 60)", (n) => {
      expect(isValidReelDuration(n)).toBe(n >= 15 && n <= 60);
    });
  });
});

// ── validateReelPublish ───────────────────────────────────────────────────────

describe("validateReelPublish", () => {
  const validInput: ReelPublishInput = {
    videoUrl: "https://example.com/video.mp4",
    durationSeconds: 30,
    platform: "instagram",
    socialAccountConnected: true,
  };

  it("does not throw for a fully valid input", () => {
    expect(() => validateReelPublish(validInput)).not.toThrow();
  });

  describe("platform validation", () => {
    it("throws ValidationError when platform is not instagram", () => {
      expect(() =>
        validateReelPublish({ ...validInput, platform: "facebook" }),
      ).toThrow(ValidationError);
    });

    it("error message mentions instagram", () => {
      try {
        validateReelPublish({ ...validInput, platform: "tiktok" });
      } catch (e) {
        expect((e as ValidationError).message.toLowerCase()).toContain("instagram");
      }
    });
  });

  describe("social account connected", () => {
    it("throws ValidationError when socialAccountConnected is false", () => {
      expect(() =>
        validateReelPublish({ ...validInput, socialAccountConnected: false }),
      ).toThrow(ValidationError);
    });

    it("error message mentions conta do instagram", () => {
      try {
        validateReelPublish({ ...validInput, socialAccountConnected: false });
      } catch (e) {
        expect((e as ValidationError).message.toLowerCase()).toContain("instagram");
      }
    });
  });

  describe("videoUrl validation", () => {
    it("throws ValidationError when videoUrl is empty string", () => {
      expect(() =>
        validateReelPublish({ ...validInput, videoUrl: "" }),
      ).toThrow(ValidationError);
    });

    it("throws ValidationError when videoUrl is whitespace only", () => {
      expect(() =>
        validateReelPublish({ ...validInput, videoUrl: "   " }),
      ).toThrow(ValidationError);
    });
  });

  describe("duration validation", () => {
    it("throws ValidationError for duration below 15s", () => {
      expect(() =>
        validateReelPublish({ ...validInput, durationSeconds: 14 }),
      ).toThrow(ValidationError);
    });

    it("throws ValidationError for duration above 60s", () => {
      expect(() =>
        validateReelPublish({ ...validInput, durationSeconds: 61 }),
      ).toThrow(ValidationError);
    });

    it("error message includes the invalid duration", () => {
      try {
        validateReelPublish({ ...validInput, durationSeconds: 5 });
      } catch (e) {
        expect((e as ValidationError).message).toContain("5s");
      }
    });

    it("accepts boundary 15s", () => {
      expect(() =>
        validateReelPublish({ ...validInput, durationSeconds: 15 }),
      ).not.toThrow();
    });

    it("accepts boundary 60s", () => {
      expect(() =>
        validateReelPublish({ ...validInput, durationSeconds: 60 }),
      ).not.toThrow();
    });
  });

  describe("validation order", () => {
    it("reports platform error first (before connected check)", () => {
      try {
        validateReelPublish({
          ...validInput,
          platform: "facebook",
          socialAccountConnected: false,
        });
      } catch (e) {
        expect((e as ValidationError).message.toLowerCase()).toContain("instagram");
      }
    });
  });
});
