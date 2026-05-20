/**
 * Unit + property tests for profile-auditor.service.ts
 *
 * Covers:
 *  - P9.1: 0 ≤ overallScore ≤ 100 (integer)
 *  - Validation of all required input fields
 *  - Bedrock not called when validation fails
 *  - Minimum 3 recommendations always returned
 */

import { auditProfile, type AuditInput } from "@server/services/profile-auditor.service";
import { ValidationError, NotFoundError } from "@server/lib/errors";

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

const mockFindCompany = jest.mocked(prisma.company.findUnique);
const mockBedrock = jest.mocked(generateTextWithBedrock);

const validCompany = {
  id: "company-1",
  objective: "Gerar leads",
  tone: "professional",
  sector: "Tecnologia",
};

const validInput: AuditInput = {
  bio: "We make amazing products 🚀",
  followerCount: 10000,
  engagementRate: 3.5,
  niche: "tecnologia",
};

function makeBedrockAuditResponse(overrides: Partial<{
  overallScore: number;
  components: Array<{ name: string; score: number; feedback: string }>;
  recommendations: string[];
}> = {}) {
  const payload = {
    overallScore: 75,
    components: [
      { name: "Bio", score: 80, feedback: "Good bio" },
      { name: "Consistência visual", score: 70, feedback: "Could improve" },
      { name: "Frequência de postagem", score: 65, feedback: "Post more" },
      { name: "Engajamento", score: 85, feedback: "Great engagement" },
    ],
    recommendations: ["Rec 1", "Rec 2", "Rec 3"],
    ...overrides,
  };
  return {
    options: [{ title: "Audit", content: JSON.stringify(payload) }],
    usage: { inputTokens: 100, outputTokens: 200, costUsd: 0.002, model: "claude" },
  };
}

beforeEach(() => jest.clearAllMocks());

describe("auditProfile", () => {
  describe("P9.1 – score is always integer in [0, 100]", () => {
    it("returns score within [0, 100] for valid input", async () => {
      mockFindCompany.mockResolvedValue(validCompany as never);
      mockBedrock.mockResolvedValue(makeBedrockAuditResponse({ overallScore: 75 }) as never);

      const result = await auditProfile("company-1", validInput);

      expect(result.overallScore).toBeGreaterThanOrEqual(0);
      expect(result.overallScore).toBeLessThanOrEqual(100);
      expect(Number.isInteger(result.overallScore)).toBe(true);
    });

    it("clamps a score above 100 to 100", async () => {
      mockFindCompany.mockResolvedValue(validCompany as never);
      mockBedrock.mockResolvedValue(makeBedrockAuditResponse({ overallScore: 150 }) as never);

      const result = await auditProfile("company-1", validInput);
      expect(result.overallScore).toBe(100);
    });

    it("clamps a score below 0 to 0", async () => {
      mockFindCompany.mockResolvedValue(validCompany as never);
      mockBedrock.mockResolvedValue(makeBedrockAuditResponse({ overallScore: -10 }) as never);

      const result = await auditProfile("company-1", validInput);
      expect(result.overallScore).toBe(0);
    });

    it("rounds a decimal score to integer", async () => {
      mockFindCompany.mockResolvedValue(validCompany as never);
      mockBedrock.mockResolvedValue(makeBedrockAuditResponse({ overallScore: 72.7 }) as never);

      const result = await auditProfile("company-1", validInput);
      expect(Number.isInteger(result.overallScore)).toBe(true);
    });

    // Property: any AI-returned score is always clamped to [0,100]
    it.each([0, 50, 100, 101, 200, -1, 99.9])(
      "property: score clamped for AI value %d",
      async (aiScore) => {
        mockFindCompany.mockResolvedValue(validCompany as never);
        mockBedrock.mockResolvedValue(makeBedrockAuditResponse({ overallScore: aiScore }) as never);

        const result = await auditProfile("company-1", validInput);
        expect(result.overallScore).toBeGreaterThanOrEqual(0);
        expect(result.overallScore).toBeLessThanOrEqual(100);
      },
    );
  });

  describe("validation — required fields", () => {
    it("throws ValidationError when bio is empty", async () => {
      mockFindCompany.mockResolvedValue(validCompany as never);
      await expect(
        auditProfile("company-1", { ...validInput, bio: "" }),
      ).rejects.toThrow(ValidationError);
    });

    it("throws ValidationError when niche is empty", async () => {
      mockFindCompany.mockResolvedValue(validCompany as never);
      await expect(
        auditProfile("company-1", { ...validInput, niche: "" }),
      ).rejects.toThrow(ValidationError);
    });

    it("throws ValidationError when followerCount is negative", async () => {
      mockFindCompany.mockResolvedValue(validCompany as never);
      await expect(
        auditProfile("company-1", { ...validInput, followerCount: -1 }),
      ).rejects.toThrow(ValidationError);
    });

    it("accepts followerCount of 0", async () => {
      mockFindCompany.mockResolvedValue(validCompany as never);
      mockBedrock.mockResolvedValue(makeBedrockAuditResponse() as never);

      await expect(
        auditProfile("company-1", { ...validInput, followerCount: 0 }),
      ).resolves.not.toThrow();
    });

    it("throws ValidationError when engagementRate > 100", async () => {
      mockFindCompany.mockResolvedValue(validCompany as never);
      await expect(
        auditProfile("company-1", { ...validInput, engagementRate: 101 }),
      ).rejects.toThrow(ValidationError);
    });

    it("throws ValidationError when engagementRate < 0", async () => {
      mockFindCompany.mockResolvedValue(validCompany as never);
      await expect(
        auditProfile("company-1", { ...validInput, engagementRate: -1 }),
      ).rejects.toThrow(ValidationError);
    });

    it("does NOT call Bedrock when validation fails", async () => {
      mockFindCompany.mockResolvedValue(validCompany as never);

      await expect(
        auditProfile("company-1", { ...validInput, bio: "" }),
      ).rejects.toThrow(ValidationError);
      expect(mockBedrock).not.toHaveBeenCalled();
    });
  });

  describe("company not found", () => {
    it("throws NotFoundError when company does not exist", async () => {
      mockFindCompany.mockResolvedValue(null);

      await expect(auditProfile("nonexistent", validInput)).rejects.toThrow(NotFoundError);
    });
  });

  describe("recommendations — always ≥ 3", () => {
    it("pads with generic recommendations when AI returns fewer than 3", async () => {
      mockFindCompany.mockResolvedValue(validCompany as never);
      mockBedrock.mockResolvedValue(
        makeBedrockAuditResponse({ recommendations: ["Only one rec"] }) as never,
      );

      const result = await auditProfile("company-1", validInput);
      expect(result.recommendations.length).toBeGreaterThanOrEqual(3);
    });

    it("keeps more than 3 recommendations if AI provides them", async () => {
      mockFindCompany.mockResolvedValue(validCompany as never);
      mockBedrock.mockResolvedValue(
        makeBedrockAuditResponse({
          recommendations: ["R1", "R2", "R3", "R4", "R5"],
        }) as never,
      );

      const result = await auditProfile("company-1", validInput);
      expect(result.recommendations.length).toBe(5);
    });
  });

  describe("output shape", () => {
    it("includes generatedAt as a Date", async () => {
      mockFindCompany.mockResolvedValue(validCompany as never);
      mockBedrock.mockResolvedValue(makeBedrockAuditResponse() as never);

      const result = await auditProfile("company-1", validInput);
      expect(result.generatedAt).toBeInstanceOf(Date);
    });

    it("returns components array", async () => {
      mockFindCompany.mockResolvedValue(validCompany as never);
      mockBedrock.mockResolvedValue(makeBedrockAuditResponse() as never);

      const result = await auditProfile("company-1", validInput);
      expect(Array.isArray(result.components)).toBe(true);
    });
  });
});
