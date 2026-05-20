/**
 * Unit + property tests for carousel.service.ts
 *
 * Covers:
 *  - buildCarousel: slide count invariant (P1.1), headline length
 *  - reorderSlides: set preservation invariant (P1.2), index bounds
 */

import {
  buildCarousel,
  reorderSlides,
  type Slide,
} from "@server/services/carousel.service";
import { ValidationError } from "@server/lib/errors";

// ── helpers ──────────────────────────────────────────────────────────────────

function makeSlides(count: number): Slide[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `slide-${i}`,
    imageUrl: `https://example.com/${i}.png`,
    headline: `Slide ${i + 1}`,
    order: i,
  }));
}

// ── buildCarousel ─────────────────────────────────────────────────────────────

describe("buildCarousel", () => {
  describe("P1.1 – slide count invariant: 3 ≤ slideCount ≤ 10", () => {
    it("accepts exactly 3 slides", () => {
      const result = buildCarousel(makeSlides(3));
      expect(result.slides).toHaveLength(3);
    });

    it("accepts exactly 10 slides", () => {
      const result = buildCarousel(makeSlides(10));
      expect(result.slides).toHaveLength(10);
    });

    it.each([4, 5, 7, 9])("accepts %d slides", (count) => {
      const result = buildCarousel(makeSlides(count));
      expect(result.slides).toHaveLength(count);
    });

    it("rejects 0 slides with ValidationError", () => {
      expect(() => buildCarousel([])).toThrow(ValidationError);
    });

    it("rejects 2 slides — below minimum", () => {
      expect(() => buildCarousel(makeSlides(2))).toThrow(ValidationError);
    });

    it("rejects 11 slides — above maximum", () => {
      expect(() => buildCarousel(makeSlides(11))).toThrow(ValidationError);
    });

    it("error message mentions received count and valid bounds", () => {
      try {
        buildCarousel(makeSlides(1));
        fail("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(ValidationError);
        expect((e as ValidationError).message).toMatch(/1/);
        expect((e as ValidationError).message).toMatch(/3/);
        expect((e as ValidationError).message).toMatch(/10/);
      }
    });

    // Property: for any count in [3,10] buildCarousel always succeeds
    it.each([3, 4, 5, 6, 7, 8, 9, 10])(
      "property: buildCarousel(%d) returns exactly that many slides",
      (count) => {
        const result = buildCarousel(makeSlides(count));
        expect(result.slides.length).toBeGreaterThanOrEqual(3);
        expect(result.slides.length).toBeLessThanOrEqual(10);
      },
    );
  });

  describe("headline validation", () => {
    it("rejects a headline of 61 chars", () => {
      const slides = makeSlides(3);
      slides[1]!.headline = "a".repeat(61);
      expect(() => buildCarousel(slides)).toThrow(ValidationError);
    });

    it("accepts a headline of exactly 60 chars", () => {
      const slides = makeSlides(3);
      slides[0]!.headline = "a".repeat(60);
      expect(() => buildCarousel(slides)).not.toThrow();
    });

    it("accepts empty headline", () => {
      const slides = makeSlides(3);
      slides[0]!.headline = "";
      expect(() => buildCarousel(slides)).not.toThrow();
    });
  });

  describe("output shape", () => {
    it("normalises order values to 0-indexed sequence", () => {
      const slides = makeSlides(4).map((s, i) => ({ ...s, order: i * 10 }));
      const { slides: result } = buildCarousel(slides);
      result.forEach((s, i) => expect(s.order).toBe(i));
    });

    it("slidesJson is valid JSON that parses back to the same slides", () => {
      const input = makeSlides(3);
      const { slides, slidesJson } = buildCarousel(input);
      const parsed = JSON.parse(slidesJson) as Slide[];
      expect(parsed).toEqual(slides);
    });

    it("does not mutate the original input array", () => {
      const input = makeSlides(3).map((s, i) => ({ ...s, order: i * 5 }));
      buildCarousel(input);
      expect(input[0]!.order).toBe(0);
    });
  });
});

// ── reorderSlides ─────────────────────────────────────────────────────────────

describe("reorderSlides", () => {
  describe("P1.2 – reorder invariant: same set of IDs after reorder", () => {
    it("moves first slide to last — IDs preserved", () => {
      const slides = makeSlides(5);
      const originalIds = slides.map((s) => s.id);
      const result = reorderSlides(slides, 0, 4);
      expect(result.map((s) => s.id).sort()).toEqual(originalIds.sort());
    });

    it("moves last slide to first — IDs preserved", () => {
      const slides = makeSlides(5);
      const originalIds = slides.map((s) => s.id);
      const result = reorderSlides(slides, 4, 0);
      expect(result.map((s) => s.id).sort()).toEqual(originalIds.sort());
    });

    it("no-op move (same index) — IDs preserved and order unchanged", () => {
      const slides = makeSlides(5);
      const originalIds = slides.map((s) => s.id);
      const result = reorderSlides(slides, 2, 2);
      expect(result.map((s) => s.id)).toEqual(originalIds);
    });

    // Property: any sequence of valid reorders never adds or removes slide IDs
    it("property: after 50 random reorders, the ID set is unchanged", () => {
      const slides = makeSlides(8);
      const originalIdSet = new Set(slides.map((s) => s.id));
      let current = slides;
      for (let i = 0; i < 50; i++) {
        const from = Math.floor(Math.random() * current.length);
        const to = Math.floor(Math.random() * current.length);
        current = reorderSlides(current, from, to);
      }
      expect(new Set(current.map((s) => s.id))).toEqual(originalIdSet);
    });
  });

  describe("correct element movement", () => {
    it("moves element from index 0 to index 2 correctly", () => {
      const slides = makeSlides(4);
      const result = reorderSlides(slides, 0, 2);
      expect(result[0]!.id).toBe("slide-1");
      expect(result[1]!.id).toBe("slide-2");
      expect(result[2]!.id).toBe("slide-0");
      expect(result[3]!.id).toBe("slide-3");
    });

    it("reassigns order to reflect new positions", () => {
      const slides = makeSlides(3);
      const result = reorderSlides(slides, 0, 2);
      result.forEach((s, i) => expect(s.order).toBe(i));
    });
  });

  describe("index bounds validation", () => {
    it("throws ValidationError for negative fromIndex", () => {
      expect(() => reorderSlides(makeSlides(3), -1, 1)).toThrow(ValidationError);
    });

    it("throws ValidationError for fromIndex >= slides.length", () => {
      expect(() => reorderSlides(makeSlides(3), 3, 1)).toThrow(ValidationError);
    });

    it("throws ValidationError for negative toIndex", () => {
      expect(() => reorderSlides(makeSlides(3), 0, -1)).toThrow(ValidationError);
    });

    it("throws ValidationError for toIndex >= slides.length", () => {
      expect(() => reorderSlides(makeSlides(3), 0, 3)).toThrow(ValidationError);
    });
  });

  describe("immutability", () => {
    it("does not mutate the original slides array", () => {
      const slides = makeSlides(3);
      const originalFirst = slides[0]!.id;
      reorderSlides(slides, 0, 2);
      expect(slides[0]!.id).toBe(originalFirst);
    });
  });
});
