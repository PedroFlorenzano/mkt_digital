/**
 * Unit tests for budget-intelligence.service.ts
 *
 * Tests the public API with all external dependencies mocked.
 * Focuses on validation, AI response parsing, and clamping logic.
 */

import { budgetIntelligenceService } from "@server/services/budget-intelligence.service";
import { NotFoundError } from "@server/lib/errors";

jest.mock("@server/lib/prisma", () => ({
  prisma: {
    company: { findUnique: jest.fn() },
    adCampaign: { findMany: jest.fn(), update: jest.fn() },
    adMetricSnapshot: { findMany: jest.fn() },
    campaignAuditLog: { create: jest.fn() },
  },
}));
jest.mock("@server/lib/bedrock", () => ({
  generateTextWithBedrock: jest.fn(),
}));
jest.mock("@server/services/credential.service", () => ({
  credentialService: { get: jest.fn() },
}));
jest.mock("@server/lib/meta-ads.connector", () => ({
  metaAdsConnector: { updateAdSetBudget: jest.fn() },
}));
jest.mock("@server/lib/google-ads.connector", () => ({
  googleAdsConnector: { updateCampaignBudget: jest.fn() },
}));
jest.mock("@server/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { prisma } from "@server/lib/prisma";
import { generateTextWithBedrock } from "@server/lib/bedrock";

const mockCompany = jest.mocked(prisma.company.findUnique);
const mockCampaigns = jest.mocked(prisma.adCampaign.findMany);
const mockSnapshots = jest.mocked(prisma.adMetricSnapshot.findMany);
const mockBedrock = jest.mocked(generateTextWithBedrock);

const sampleCampaign = {
  id: "camp-1",
  name: "Summer Campaign",
  platform: "meta",
  dailyBudgetBrl: 100,
};

function makeSnapshot(date: string, roas = 2.0) {
  return {
    campaignId: "camp-1",
    spendBrl: 50,
    roas,
    conversions: 5,
    collectedAt: new Date(date),
  };
}

function makeBedrockResponse(allocations: Array<{ campaignId: string; recommendedDailyBudgetBrl: number; justification: string }>) {
  return {
    options: [{
      title: "Budget",
      content: JSON.stringify({
        aiSummary: "Portfolio looks stable.",
        allocations,
      }),
    }],
    usage: { inputTokens: 200, outputTokens: 100, costUsd: 0.003, model: "claude" },
  };
}

beforeEach(() => jest.clearAllMocks());

describe("budgetIntelligenceService.getRecommendations", () => {
  it("throws NotFoundError when company does not exist", async () => {
    mockCompany.mockResolvedValue(null);

    await expect(
      budgetIntelligenceService.getRecommendations("nonexistent"),
    ).rejects.toThrow(NotFoundError);
  });

  it("returns empty allocations when no active campaigns", async () => {
    mockCompany.mockResolvedValue({ id: "company-1" } as never);
    mockCampaigns.mockResolvedValue([]);
    mockBedrock.mockResolvedValue(makeBedrockResponse([]) as never);

    const result = await budgetIntelligenceService.getRecommendations("company-1");
    expect(result.allocations).toHaveLength(0);
    expect(result.aiSummary).toBe("Portfolio looks stable.");
    expect(result.generatedAt).toBeInstanceOf(Date);
  });

  it("returns recommendations with correct shape", async () => {
    mockCompany.mockResolvedValue({ id: "company-1" } as never);
    mockCampaigns.mockResolvedValue([sampleCampaign] as never);
    mockSnapshots.mockResolvedValue([
      makeSnapshot("2026-05-01"),
      makeSnapshot("2026-05-02"),
    ] as never);
    mockBedrock.mockResolvedValue(
      makeBedrockResponse([
        { campaignId: "camp-1", recommendedDailyBudgetBrl: 120, justification: "Good ROAS" },
      ]) as never,
    );

    const result = await budgetIntelligenceService.getRecommendations("company-1");

    expect(result.allocations).toHaveLength(1);
    const alloc = result.allocations[0]!;
    expect(alloc.campaignId).toBe("camp-1");
    expect(alloc.recommendedDailyBudgetBrl).toBe(120);
    expect(["sufficient", "insufficient"]).toContain(alloc.dataConfidence);
  });

  it("falls back to current budget when AI omits a campaign from response", async () => {
    mockCompany.mockResolvedValue({ id: "company-1" } as never);
    mockCampaigns.mockResolvedValue([sampleCampaign] as never);
    mockSnapshots.mockResolvedValue([makeSnapshot("2026-05-01")] as never);
    // AI returns empty allocations (missing camp-1)
    mockBedrock.mockResolvedValue(makeBedrockResponse([]) as never);

    const result = await budgetIntelligenceService.getRecommendations("company-1");
    expect(result.allocations[0]!.recommendedDailyBudgetBrl).toBe(100); // fallback = current
  });

  it("marks dataConfidence as insufficient when < 7 days of data", async () => {
    mockCompany.mockResolvedValue({ id: "company-1" } as never);
    mockCampaigns.mockResolvedValue([sampleCampaign] as never);
    // Only 3 distinct days
    mockSnapshots.mockResolvedValue([
      makeSnapshot("2026-05-01"),
      makeSnapshot("2026-05-02"),
      makeSnapshot("2026-05-03"),
    ] as never);
    mockBedrock.mockResolvedValue(
      makeBedrockResponse([
        { campaignId: "camp-1", recommendedDailyBudgetBrl: 100, justification: "Low data" },
      ]) as never,
    );

    const result = await budgetIntelligenceService.getRecommendations("company-1");
    expect(result.allocations[0]!.dataConfidence).toBe("insufficient");
  });

  it("marks dataConfidence as sufficient when >= 7 days of data", async () => {
    mockCompany.mockResolvedValue({ id: "company-1" } as never);
    mockCampaigns.mockResolvedValue([sampleCampaign] as never);
    const snaps = Array.from({ length: 10 }, (_, i) =>
      makeSnapshot(`2026-05-${String(i + 1).padStart(2, "0")}`),
    );
    mockSnapshots.mockResolvedValue(snaps as never);
    mockBedrock.mockResolvedValue(
      makeBedrockResponse([
        { campaignId: "camp-1", recommendedDailyBudgetBrl: 150, justification: "Sufficient data" },
      ]) as never,
    );

    const result = await budgetIntelligenceService.getRecommendations("company-1");
    expect(result.allocations[0]!.dataConfidence).toBe("sufficient");
  });
});
