/**
 * Unit + property tests for variation.service.ts
 *
 * Covers:
 *  - buildBrandPrompt (P4.1, P4.2, P4.3)
 *  - parseColors
 */

import {
  buildBrandPrompt,
  parseColors,
  type BrandContext,
} from "@server/services/variation.service";

// ── buildBrandPrompt ──────────────────────────────────────────────────────────

describe("buildBrandPrompt", () => {
  const base = "A summer beach scene";

  const fullCtx: BrandContext = {
    colors: ["#3B82F6", "#1E40AF", "#FFFFFF"],
    tone: "professional",
    sector: "Moda",
    objective: "Aumentar seguidores",
  };

  describe("P4.1 – Brand_Context in prompt: all hex colors present", () => {
    it("includes all color values when colors array is non-empty", () => {
      const prompt = buildBrandPrompt(base, fullCtx);
      expect(prompt).toContain("#3B82F6");
      expect(prompt).toContain("#1E40AF");
      expect(prompt).toContain("#FFFFFF");
    });

    it("property: for any non-empty colors array, each hex appears in the prompt", () => {
      const testCases: BrandContext[] = [
        { colors: ["#FF0000"], tone: "funny", sector: "Tech" },
        { colors: ["#AABBCC", "#001122", "#334455"], tone: "professional", sector: "Saúde" },
        { colors: ["#123456", "#789ABC", "#DEF012", "#345678", "#90ABCD"], tone: "inspirational", sector: "Educação" },
      ];
      testCases.forEach((ctx) => {
        const prompt = buildBrandPrompt("test", ctx);
        ctx.colors.forEach((hex) => {
          expect(prompt).toContain(hex);
        });
      });
    });
  });

  describe("tone and sector always present", () => {
    it("includes tone in the prompt", () => {
      const prompt = buildBrandPrompt(base, fullCtx);
      expect(prompt).toContain("professional");
    });

    it("includes sector in the prompt", () => {
      const prompt = buildBrandPrompt(base, fullCtx);
      expect(prompt).toContain("Moda");
    });

    it("includes tone even when colors is empty", () => {
      const ctx: BrandContext = { colors: [], tone: "funny", sector: "Tech" };
      const prompt = buildBrandPrompt(base, ctx);
      expect(prompt).toContain("funny");
    });
  });

  describe("optional objective", () => {
    it("includes objective when provided", () => {
      const prompt = buildBrandPrompt(base, fullCtx);
      expect(prompt).toContain("Aumentar seguidores");
    });

    it("excludes Business objective line when objective is undefined", () => {
      const ctx: BrandContext = { colors: [], tone: "professional", sector: "Tech" };
      const prompt = buildBrandPrompt(base, ctx);
      expect(prompt).not.toContain("Business objective");
    });

    it("excludes Business objective line when objective is empty string", () => {
      const ctx: BrandContext = { colors: [], tone: "professional", sector: "Tech", objective: "" };
      const prompt = buildBrandPrompt(base, ctx);
      expect(prompt).not.toContain("Business objective");
    });
  });

  describe("empty colors handling", () => {
    it("does not include Color palette line when colors is empty", () => {
      const ctx: BrandContext = { colors: [], tone: "professional", sector: "Tech" };
      const prompt = buildBrandPrompt(base, ctx);
      expect(prompt).not.toContain("Color palette");
    });
  });

  describe("base prompt preservation", () => {
    it("starts with the base prompt", () => {
      const prompt = buildBrandPrompt(base, fullCtx);
      expect(prompt.startsWith(base)).toBe(true);
    });

    it("property: base prompt is always a prefix", () => {
      const bases = ["Hello", "Complex scene with objects", "minimalist design"];
      bases.forEach((b) => {
        const prompt = buildBrandPrompt(b, fullCtx);
        expect(prompt.startsWith(b)).toBe(true);
      });
    });
  });

  describe("section separator", () => {
    it("sections are separated by single space (not double)", () => {
      const ctx: BrandContext = { colors: ["#FF0000"], tone: "funny", sector: "Tech" };
      const prompt = buildBrandPrompt("base", ctx);
      expect(prompt).not.toMatch(/  /); // no double space
    });
  });
});

// ── parseColors ───────────────────────────────────────────────────────────────

describe("parseColors", () => {
  describe("null / empty inputs", () => {
    it("returns [] for null", () => {
      expect(parseColors(null)).toEqual([]);
    });

    it("returns [] for undefined", () => {
      expect(parseColors(undefined)).toEqual([]);
    });

    it("returns [] for empty string", () => {
      expect(parseColors("")).toEqual([]);
    });

    it("returns [] for whitespace only", () => {
      expect(parseColors("   ")).toEqual([]);
    });
  });

  describe("JSON array format", () => {
    it("parses a JSON array with 3 colors", () => {
      const result = parseColors('["#3B82F6","#1E40AF","#FFFFFF"]');
      expect(result).toEqual(["#3B82F6", "#1E40AF", "#FFFFFF"]);
    });

    it("parses a JSON array with a single color", () => {
      expect(parseColors('["#FF0000"]')).toEqual(["#FF0000"]);
    });

    it("returns [] for an empty JSON array", () => {
      expect(parseColors("[]")).toEqual([]);
    });

    it("filters out non-string items in JSON array", () => {
      // Should not crash and should return only strings
      const result = parseColors('["#FF0000", 42, "#00FF00"]');
      expect(result).toContain("#FF0000");
      expect(result).toContain("#00FF00");
    });
  });

  describe("comma-separated format", () => {
    it("parses comma-separated hex colors", () => {
      const result = parseColors("#3B82F6, #1E40AF, #FFFFFF");
      expect(result).toEqual(["#3B82F6", "#1E40AF", "#FFFFFF"]);
    });

    it("trims whitespace from each color", () => {
      const result = parseColors("  #FF0000  ,  #00FF00  ");
      expect(result).toEqual(["#FF0000", "#00FF00"]);
    });

    it("handles comma-separated with no spaces", () => {
      const result = parseColors("#AA0000,#BB0000,#CC0000");
      expect(result).toEqual(["#AA0000", "#BB0000", "#CC0000"]);
    });
  });

  describe("invalid JSON falls back to comma-separated", () => {
    it("falls back gracefully when JSON is malformed", () => {
      // not a JSON array, so treated as comma-separated
      const result = parseColors("#FF0000, #00FF00");
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe("property: result is always an array", () => {
    it.each([
      null,
      undefined,
      "",
      "[]",
      '["#FF0000"]',
      "#FF0000, #00FF00",
      "invalid json {{{",
    ])("parseColors(%s) always returns an array", (input) => {
      const result = parseColors(input as string | null | undefined);
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
