/**
 * Unit + property tests for bio.service.ts
 *
 * Covers:
 *  - P7.1: every bio ≤ 150 chars
 *  - P7.2: always exactly 3 suggestions
 *  - Validation: missing fields
 *  - Bedrock error propagation
 */

import { generateBioSuggestions } from "@server/services/bio.service";
import { ValidationError, NotFoundError } from "@server/lib/errors";

// Mock prisma and bedrock
jest.mock("@server/lib/prisma", () => ({
  prisma: { company: { findUnique: jest.fn() } },
}));
jest.mock("@server/lib/bedrock", () => ({
  generateTextWithBedrock: jest.fn(),
}));
jest.mock("@server/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { prisma } from "@server/lib/prisma";
import { generateTextWithBedrock } from "@server/lib/bedrock";

const mockPrismaCompany = jest.mocked(prisma.company.findUnique);
const mockBedrock = jest.mocked(generateTextWithBedrock);

const validCompany = {
  name: "My Brand",
  sector: "Moda",
  objective: "Aumentar seguidores",
  tone: "professional",
};

const makeBioResponse = (bios: string[]) => ({
  options: [
    {
      title: "Response",
      content: JSON.stringify(bios.map((text) => ({ text }))),
    },
  ],
  usage: { inputTokens: 100, outputTokens: 50, costUsd: 0.001, model: "claude" },
});

beforeEach(() => jest.clearAllMocks());

describe("generateBioSuggestions", () => {
  describe("P7.2 – always returns exactly 3 suggestions", () => {
    it("returns 3 suggestions for a valid company", async () => {
      mockPrismaCompany.mockResolvedValue(validCompany as never);
      mockBedrock.mockResolvedValue(
        makeBioResponse([
          "Bio 1 🚀 Contacte-nos!",
          "Bio 2 ✨ Saiba mais!",
          "Bio 3 💼 Descubra!",
        ]) as never,
      );

      const result = await generateBioSuggestions("company-1");
      expect(result).toHaveLength(3);
    });

    it("property: regardless of AI returning more, we get exactly 3", async () => {
      mockPrismaCompany.mockResolvedValue(validCompany as never);
      // AI returns 5 bios
      mockBedrock.mockResolvedValue(
        makeBioResponse(["A 🌟 CTA", "B 🌟 CTA", "C 🌟 CTA", "D 🌟 CTA", "E 🌟 CTA"]) as never,
      );

      const result = await generateBioSuggestions("company-1");
      expect(result).toHaveLength(3);
    });
  });

  describe("P7.1 – every bio ≤ 150 chars", () => {
    it("truncates any bio returned longer than 150 chars", async () => {
      const longBio = "A".repeat(200) + " 🚀 CTA";
      mockPrismaCompany.mockResolvedValue(validCompany as never);
      mockBedrock.mockResolvedValue(
        makeBioResponse([longBio, "Short 🌟 CTA", "Medium length bio 💼 CTA"]) as never,
      );

      const result = await generateBioSuggestions("company-1");
      result.forEach((s) => {
        expect(s.charCount).toBeLessThanOrEqual(150);
        expect(s.text.length).toBeLessThanOrEqual(150);
      });
    });

    it("charCount matches actual text length", async () => {
      mockPrismaCompany.mockResolvedValue(validCompany as never);
      mockBedrock.mockResolvedValue(
        makeBioResponse(["Olá mundo 🌍 CTA!", "Segunda bio ✨ Saiba mais!", "Terceira 💼 Contacte!"]) as never,
      );

      const result = await generateBioSuggestions("company-1");
      result.forEach((s) => {
        expect(s.charCount).toBe(s.text.length);
      });
    });
  });

  describe("validation", () => {
    it("throws NotFoundError when company does not exist", async () => {
      mockPrismaCompany.mockResolvedValue(null);

      await expect(generateBioSuggestions("nonexistent")).rejects.toThrow(NotFoundError);
    });

    it("throws ValidationError when company name is missing", async () => {
      mockPrismaCompany.mockResolvedValue({
        ...validCompany,
        name: null,
      } as never);

      await expect(generateBioSuggestions("company-1")).rejects.toThrow(ValidationError);
    });

    it("throws ValidationError when sector is missing", async () => {
      mockPrismaCompany.mockResolvedValue({
        ...validCompany,
        sector: null,
      } as never);

      await expect(generateBioSuggestions("company-1")).rejects.toThrow(ValidationError);
    });

    it("throws ValidationError when objective is missing", async () => {
      mockPrismaCompany.mockResolvedValue({
        ...validCompany,
        objective: null,
      } as never);

      await expect(generateBioSuggestions("company-1")).rejects.toThrow(ValidationError);
    });

    it("throws ValidationError when all required fields are empty strings", async () => {
      mockPrismaCompany.mockResolvedValue({
        name: "",
        sector: "",
        objective: "",
        tone: "professional",
      } as never);

      await expect(generateBioSuggestions("company-1")).rejects.toThrow(ValidationError);
    });

    it("does NOT call Bedrock when validation fails", async () => {
      mockPrismaCompany.mockResolvedValue({ name: "", sector: "Tech", objective: "grow", tone: "professional" } as never);

      await expect(generateBioSuggestions("company-1")).rejects.toThrow(ValidationError);
      expect(mockBedrock).not.toHaveBeenCalled();
    });
  });

  describe("Bedrock error propagation", () => {
    it("re-throws Bedrock errors as-is", async () => {
      mockPrismaCompany.mockResolvedValue(validCompany as never);
      const bedrockError = new Error("AWS Bedrock timeout");
      mockBedrock.mockRejectedValue(bedrockError);

      await expect(generateBioSuggestions("company-1")).rejects.toThrow("AWS Bedrock timeout");
    });
  });

  describe("output shape", () => {
    it("each suggestion has text and charCount properties", async () => {
      mockPrismaCompany.mockResolvedValue(validCompany as never);
      mockBedrock.mockResolvedValue(
        makeBioResponse(["Bio A 🌟 Clique aqui!", "Bio B 💼 Saiba mais!", "Bio C 🚀 Contacte!"]) as never,
      );

      const result = await generateBioSuggestions("company-1");
      result.forEach((s) => {
        expect(typeof s.text).toBe("string");
        expect(typeof s.charCount).toBe("number");
      });
    });
  });
});
