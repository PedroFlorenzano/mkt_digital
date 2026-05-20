/**
 * Unit + property tests for boost.service.ts
 *
 * Covers:
 *  - P5.1 (safety): no AdCampaign without CampaignAuditLog approved
 *  - analyzePost: all validation branches, Bedrock integration, clamping
 *  - confirmBoost: audit log creation, campaign creation, no-credential path
 */

import { boostService, type BoostSuggestion } from "@server/services/boost.service";
import { ValidationError, NotFoundError } from "@server/lib/errors";

// Mock prisma and bedrock
jest.mock("@server/lib/prisma", () => ({
  prisma: {
    company: { findUnique: jest.fn() },
    post: { findUnique: jest.fn(), update: jest.fn() },
    adPlatformCredential: { findFirst: jest.fn() },
    adCampaign: { create: jest.fn() },
    campaignAuditLog: { create: jest.fn(), update: jest.fn() },
  },
}));
jest.mock("@server/lib/bedrock", () => ({
  generateTextWithBedrock: jest.fn(),
}));
jest.mock("@server/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { prisma } from "@server/lib/prisma";
import { generateTextWithBedrock } from "@server/lib/bedrock";

const mockCompany = jest.mocked(prisma.company.findUnique);
const mockPost = jest.mocked(prisma.post.findUnique);
const mockPostUpdate = jest.mocked(prisma.post.update);
const mockCredential = jest.mocked(prisma.adPlatformCredential.findFirst);
const mockCampaignCreate = jest.mocked(prisma.adCampaign.create);
const mockAuditCreate = jest.mocked(prisma.campaignAuditLog.create);
const mockAuditUpdate = jest.mocked(prisma.campaignAuditLog.update);
const mockBedrock = jest.mocked(generateTextWithBedrock);

const company = {
  id: "company-1",
  name: "Test Brand",
  sector: "Moda",
  objective: "Gerar leads",
  tone: "professional",
  colors: '["#3B82F6"]',
};

const publishedPost = {
  id: "post-1",
  companyId: "company-1",
  content: "Great post content",
  imageUrl: null,
  platform: "instagram",
  format: "post",
  status: "published",
};

const validSuggestion: BoostSuggestion = {
  objective: "Aumentar alcance",
  targetAudience: "Mulheres 25-45",
  dailyBudgetBrl: 50,
  durationDays: 7,
  rationale: "Good engagement metrics",
};

function makeBedrockBoostResponse(suggestion: Partial<BoostSuggestion> = {}) {
  return {
    options: [
      {
        title: "Boost",
        content: JSON.stringify({
          objective: "Aumentar alcance",
          targetAudience: "Público geral",
          dailyBudgetBrl: 50,
          durationDays: 7,
          rationale: "Adequate performance",
          ...suggestion,
        }),
      },
    ],
    usage: { inputTokens: 100, outputTokens: 150, costUsd: 0.002, model: "claude" },
  };
}

beforeEach(() => jest.clearAllMocks());

describe("boostService.analyzePost", () => {
  it("throws NotFoundError when company does not exist", async () => {
    mockCompany.mockResolvedValue(null);

    await expect(boostService.analyzePost("nonexistent", "post-1")).rejects.toThrow(NotFoundError);
  });

  it("throws NotFoundError when post does not exist", async () => {
    mockCompany.mockResolvedValue(company as never);
    mockPost.mockResolvedValue(null);

    await expect(boostService.analyzePost("company-1", "nonexistent")).rejects.toThrow(NotFoundError);
  });

  it("throws NotFoundError when post belongs to different company", async () => {
    mockCompany.mockResolvedValue(company as never);
    mockPost.mockResolvedValue({ ...publishedPost, companyId: "other-company" } as never);

    await expect(boostService.analyzePost("company-1", "post-1")).rejects.toThrow(NotFoundError);
  });

  it("throws ValidationError when post status is draft", async () => {
    mockCompany.mockResolvedValue(company as never);
    mockPost.mockResolvedValue({ ...publishedPost, status: "draft" } as never);

    await expect(boostService.analyzePost("company-1", "post-1")).rejects.toThrow(ValidationError);
  });

  it("does not throw for status published", async () => {
    mockCompany.mockResolvedValue(company as never);
    mockPost.mockResolvedValue(publishedPost as never);
    mockBedrock.mockResolvedValue(makeBedrockBoostResponse() as never);
    mockPostUpdate.mockResolvedValue({} as never);

    await expect(boostService.analyzePost("company-1", "post-1")).resolves.not.toThrow();
  });

  it("does not throw for status scheduled", async () => {
    mockCompany.mockResolvedValue(company as never);
    mockPost.mockResolvedValue({ ...publishedPost, status: "scheduled" } as never);
    mockBedrock.mockResolvedValue(makeBedrockBoostResponse() as never);
    mockPostUpdate.mockResolvedValue({} as never);

    await expect(boostService.analyzePost("company-1", "post-1")).resolves.not.toThrow();
  });

  it("clamps dailyBudgetBrl to minimum 5", async () => {
    mockCompany.mockResolvedValue(company as never);
    mockPost.mockResolvedValue(publishedPost as never);
    mockBedrock.mockResolvedValue(makeBedrockBoostResponse({ dailyBudgetBrl: 1 }) as never);
    mockPostUpdate.mockResolvedValue({} as never);

    const result = await boostService.analyzePost("company-1", "post-1");
    expect(result.dailyBudgetBrl).toBe(5);
  });

  it("clamps dailyBudgetBrl to maximum 300", async () => {
    mockCompany.mockResolvedValue(company as never);
    mockPost.mockResolvedValue(publishedPost as never);
    mockBedrock.mockResolvedValue(makeBedrockBoostResponse({ dailyBudgetBrl: 5000 }) as never);
    mockPostUpdate.mockResolvedValue({} as never);

    const result = await boostService.analyzePost("company-1", "post-1");
    expect(result.dailyBudgetBrl).toBe(300);
  });

  it("clamps durationDays to minimum 1", async () => {
    mockCompany.mockResolvedValue(company as never);
    mockPost.mockResolvedValue(publishedPost as never);
    mockBedrock.mockResolvedValue(makeBedrockBoostResponse({ durationDays: 0 }) as never);
    mockPostUpdate.mockResolvedValue({} as never);

    const result = await boostService.analyzePost("company-1", "post-1");
    expect(result.durationDays).toBe(1);
  });

  it("clamps durationDays to maximum 30", async () => {
    mockCompany.mockResolvedValue(company as never);
    mockPost.mockResolvedValue(publishedPost as never);
    mockBedrock.mockResolvedValue(makeBedrockBoostResponse({ durationDays: 100 }) as never);
    mockPostUpdate.mockResolvedValue({} as never);

    const result = await boostService.analyzePost("company-1", "post-1");
    expect(result.durationDays).toBe(30);
  });

  it("saves suggestion to post.boostSuggestionJson", async () => {
    mockCompany.mockResolvedValue(company as never);
    mockPost.mockResolvedValue(publishedPost as never);
    mockBedrock.mockResolvedValue(makeBedrockBoostResponse() as never);
    mockPostUpdate.mockResolvedValue({} as never);

    await boostService.analyzePost("company-1", "post-1");

    expect(mockPostUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "post-1" },
        data: { boostSuggestionJson: expect.any(String) },
      }),
    );
  });
});

describe("boostService.confirmBoost", () => {
  beforeEach(() => {
    mockCompany.mockResolvedValue(company as never);
    mockPost.mockResolvedValue(publishedPost as never);
    mockAuditCreate.mockResolvedValue({ id: "audit-1" } as never);
    mockAuditUpdate.mockResolvedValue({} as never);
    mockPostUpdate.mockResolvedValue({} as never);
  });

  describe("P5.1 – safety: no AdCampaign without CampaignAuditLog approved", () => {
    it("always creates CampaignAuditLog with userDecision=approved BEFORE AdCampaign", async () => {
      const callOrder: string[] = [];
      mockAuditCreate.mockImplementation((async () => {
        callOrder.push("audit");
        return { id: "audit-1" };
      }) as unknown as typeof mockAuditCreate);
      mockCredential.mockResolvedValue({ id: "cred-1" } as never);
      mockCampaignCreate.mockImplementation((async () => {
        callOrder.push("campaign");
        return { id: "campaign-1" };
      }) as unknown as typeof mockCampaignCreate);

      await boostService.confirmBoost("company-1", "post-1", validSuggestion, "user-1");

      const auditIdx = callOrder.indexOf("audit");
      const campaignIdx = callOrder.indexOf("campaign");
      // Audit must be created before campaign
      expect(auditIdx).toBeLessThan(campaignIdx);
    });

    it("creates audit log with userDecision=approved", async () => {
      mockCredential.mockResolvedValue({ id: "cred-1" } as never);
      mockCampaignCreate.mockResolvedValue({ id: "campaign-1" } as never);

      await boostService.confirmBoost("company-1", "post-1", validSuggestion, "user-1");

      expect(mockAuditCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userDecision: "approved",
            requiresConfirmation: true,
          }),
        }),
      );
    });

    it("does NOT create AdCampaign when no valid credentials exist", async () => {
      mockCredential.mockResolvedValue(null);

      await boostService.confirmBoost("company-1", "post-1", validSuggestion, "user-1");

      // Audit log is still created (confirmation recorded)
      expect(mockAuditCreate).toHaveBeenCalled();
      // But no AdCampaign
      expect(mockCampaignCreate).not.toHaveBeenCalled();
    });
  });

  it("throws NotFoundError when company does not exist", async () => {
    mockCompany.mockResolvedValue(null);

    await expect(
      boostService.confirmBoost("nonexistent", "post-1", validSuggestion, "user-1"),
    ).rejects.toThrow(NotFoundError);
  });

  it("throws NotFoundError when post does not exist", async () => {
    mockPost.mockResolvedValue(null);

    await expect(
      boostService.confirmBoost("company-1", "nonexistent", validSuggestion, "user-1"),
    ).rejects.toThrow(NotFoundError);
  });

  it("creates AdCampaign with campaignType=boost when credentials exist", async () => {
    mockCredential.mockResolvedValue({ id: "cred-1" } as never);
    mockCampaignCreate.mockResolvedValue({ id: "campaign-1" } as never);

    await boostService.confirmBoost("company-1", "post-1", validSuggestion, "user-1");

    expect(mockCampaignCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          campaignType: "boost",
          sourcePostId: "post-1",
        }),
      }),
    );
  });

  it("updates post.boostCampaignId after campaign creation", async () => {
    mockCredential.mockResolvedValue({ id: "cred-1" } as never);
    mockCampaignCreate.mockResolvedValue({ id: "campaign-1" } as never);

    await boostService.confirmBoost("company-1", "post-1", validSuggestion, "user-1");

    expect(mockPostUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          boostCampaignId: "campaign-1",
        }),
      }),
    );
  });
});
