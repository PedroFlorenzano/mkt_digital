/**
 * Tests for server utility functions.
 */

import { timingSafeEqual } from "../lib/utils";

describe("timingSafeEqual", () => {
  it("returns true for identical strings", () => {
    expect(timingSafeEqual("Bearer abc123", "Bearer abc123")).toBe(true);
  });

  it("returns false for different strings of same length", () => {
    expect(timingSafeEqual("Bearer abc123", "Bearer XYZ123")).toBe(false);
  });

  it("returns false for different lengths", () => {
    expect(timingSafeEqual("short", "much longer string")).toBe(false);
  });

  it("returns false for empty vs non-empty", () => {
    expect(timingSafeEqual("", "x")).toBe(false);
  });

  it("returns true for two empty strings", () => {
    expect(timingSafeEqual("", "")).toBe(true);
  });
});
