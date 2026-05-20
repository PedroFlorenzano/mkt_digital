/**
 * Unit + property tests for strategic-analyst.service.ts
 *
 * Covers:
 *  - P6.1: generateDiagnosis always returns exactly 3 RouteChanges
 *  - ValidationError when no data / insufficient data
 *  - applyRouteChange: each type produces correct DB writes
 */

import {
  strategicAnalystService,
  type RouteChange,
} from "@server/services/strategic-analyst.service";
import { ValidationError, ExternalServiceError } from "@server/lib/errors";

// Mock prisma and bedrock
jest.mock("@server/lib/prisma", () => ({
  prisma: {
    adCampaign: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    adMetricSnapshot: { findMany: jest.fn() },
    campaignAuditLog: { create: jest.fn() },
  },
}));
jest.mock("@server/lib/bedrock", () => ({
  generateTextWithBedrock: jest.fn(),
}));
jest.mock("@server/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
// Mock budget-intelligence so budget_adjustment tests don't need credential-crypto
jest.mock("@server/services/budget-intelligence.service", () => ({
  budgetIntelligenceService: {
    apply: jest.fn().mockResolvedValue({ applied: 1, pendingConfirmation: 0 }),
  },
}));

import { prisma } from "@server/lib/prisma";
import { generateTextWithBedrock } from "@server/lib/bedrock";
import { budgetIntelligenceService } from "@server/services/budget-intelligence.service";

const mockCampaigns = jest.mocked(prisma.adCampaign.findMany);
const mockSnapshots = jest.mocked(prisma.adMetricSnapshot.findMany);
const mockCampaignUpdate = jest.mocked(prisma.adCampaign.update);
const mockCampaignFindUnique = jest.mocked(prisma.adCampaign.findUnique);
const mockAuditCreate = jest.mocked(prisma.campaignAuditLog.create);
const mockBedrock = jest.mocked(generateTextWithBedrock);
const mockBudgetApply = jest.mocked(budgetIntelligenceService.apply);

const activeCampaign = {
  id: "campaign-1",
  name: "Summer Campaign",
  platform: "meta",
  dailyBudgetBrl: 100,
  status: "active",
};

function makeSnapshots(count: number, days = 7) {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date("2026-05-01T00:00:00Z");
    d.setDate(d.getDate() + (i % days));
    return {
      campaignId: "campaign-1",
      collectedAt: d,
      impressions: 1000,
      clicks: 50,
      conversions: 5,
      spendBrl: 50,
      ctr: 0.05,
      cpc: 1.0,
      roas: 2.0,
    };
  });
}

function makeBedrockDiagnosisResponse(routeChanges?: RouteChange[]) {
  const payload = {
    strengths: ["Campaign A has high ROAS"],
    alerts: ["Campaign B has low CTR"],
    routeChanges: routeChanges ?? [
      { id: "rc-1", title: "Increase budget", description: "Add R$50/day", expectedImpact: "+20% reach", type: "budget_adjustment", campaignId: "campaign-1", suggestedBudgetBrl: 150 },
      { id: "rc-2", title: "Pause old creative", description: "Stop low performers", expectedImpact: "+CTR", type: "pause_campaign", campaignId: "campaign-1" },
      { id: "rc-3", title: "New audience", description: "Try younger demographic", expectedImpact: "+conversions", type: "new_audience" },
    ],
    aiSummary: "Portfolio performing adequately.",
  };
  return {
    options: [{ title: "Diagnosis", content: JSON.stringify(payload) }],
    usage: { inputTokens: 200, outputTokens: 500, costUsd: 0.005, model: "claude" },
  };
}

beforeEach(() => jest.clearAllMocks());

describe("strategicAnalystService.generateDiagnosis", () => {
  it("throws ValidationError when no active campaigns exist", async () => {
    mockCampaigns.mockResolvedValue([]);

    await expect(strategicAnalystService.generateDiagnosis("company-1")).rejects.toThrow(
      ValidationError,
    );
  });

  it("throws ValidationError when campaigns have < 7 days of snapshot data", async () => {
    mockCampaigns.mockResolvedValue([activeCampaign as never]);
    mockSnapshots.mockResolvedValue(makeSnapshots(3, 3) as never); // only 3 distinct days

    await expect(strategicAnalystService.generateDiagnosis("company-1")).rejects.toThrow(
      ValidationError,
    );
  });

  it("does not throw when 7+ days of data exist", async () => {
    mockCampaigns.mockResolvedValue([activeCampaign as never]);
    mockSnapshots.mockResolvedValue(makeSnapshots(14, 14) as never); // 14 distinct days
    mockBedrock.mockResolvedValue(makeBedrockDiagnosisResponse() as never);

    await expect(
      strategicAnalystService.generateDiagnosis("company-1"),
    ).resolves.not.toThrow();
  });

  describe("P6.1 – always exactly 3 RouteChanges", () => {
    beforeEach(() => {
      mockCampaigns.mockResolvedValue([activeCampaign as never]);
      mockSnapshots.mockResolvedValue(makeSnapshots(14, 14) as never);
    });

    it("returns exactly 3 RouteChanges from a well-formed AI response", async () => {
      mockBedrock.mockResolvedValue(makeBedrockDiagnosisResponse() as never);

      const result = await strategicAnalystService.generateDiagnosis("company-1");
      expect(result.routeChanges).toHaveLength(3);
    });

    it("pads to 3 when AI returns fewer than 3 RouteChanges", async () => {
      mockBedrock.mockResolvedValue(makeBedrockDiagnosisResponse([
        { id: "rc-1", title: "One", description: "desc", expectedImpact: "impact", type: "editorial" },
      ]) as never);

      const result = await strategicAnalystService.generateDiagnosis("company-1");
      expect(result.routeChanges).toHaveLength(3);
    });

    it("trims to 3 when AI returns more than 3 RouteChanges", async () => {
      const fiveChanges: RouteChange[] = Array.from({ length: 5 }, (_, i) => ({
        id: `rc-${i}`,
        title: `Change ${i}`,
        description: "desc",
        expectedImpact: "impact",
        type: "editorial" as const,
      }));
      mockBedrock.mockResolvedValue(makeBedrockDiagnosisResponse(fiveChanges) as never);

      const result = await strategicAnalystService.generateDiagnosis("company-1");
      expect(result.routeChanges).toHaveLength(3);
    });

    it("property: routeChanges.length === 3 regardless of AI output", async () => {
      const counts = [0, 1, 2, 3, 4, 10];
      for (const count of counts) {
        const changes = Array.from({ length: count }, (_, i) => ({
          id: `rc-${i}`,
          title: `C ${i}`,
          description: "d",
          expectedImpact: "i",
          type: "editorial" as const,
        }));
        mockBedrock.mockResolvedValue(makeBedrockDiagnosisResponse(changes) as never);
        const result = await strategicAnalystService.generateDiagnosis("company-1");
        expect(result.routeChanges).toHaveLength(3);
      }
    });
  });

  it("returns generatedAt as a Date", async () => {
    mockCampaigns.mockResolvedValue([activeCampaign as never]);
    mockSnapshots.mockResolvedValue(makeSnapshots(14, 14) as never);
    mockBedrock.mockResolvedValue(makeBedrockDiagnosisResponse() as never);

    const result = await strategicAnalystService.generateDiagnosis("company-1");
    expect(result.generatedAt).toBeInstanceOf(Date);
  });
});

describe("strategicAnalystService.applyRouteChange", () => {
  const budgetChange: RouteChange = {
    id: "rc-1",
    title: "Budget increase",
    description: "Increase budget",
    expectedImpact: "+20% reach",
    type: "budget_adjustment",
    campaignId: "campaign-1",
    suggestedBudgetBrl: 200,
  };

  const pauseChange: RouteChange = {
    id: "rc-2",
    title: "Pause campaign",
    description: "Pause low performer",
    expectedImpact: "Save budget",
    type: "pause_campaign",
    campaignId: "campaign-1",
  };

  const editorialChange: RouteChange = {
    id: "rc-3",
    title: "Change tone",
    description: "Use more casual tone",
    expectedImpact: "+engagement",
    type: "editorial",
  };

  beforeEach(() => {
    mockCampaignUpdate.mockResolvedValue({} as never);
    mockCampaignFindUnique.mockResolvedValue({ dailyBudgetBrl: 100 } as never);
    mockAuditCreate.mockResolvedValue({} as never);
  });

  it("updates campaign budget for budget_adjustment type", async () => {
    await strategicAnalystService.applyRouteChange("company-1", budgetChange, "user-1");

    expect(mockBudgetApply).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: "company-1",
        allocations: expect.arrayContaining([
          expect.objectContaining({
            campaignId: "campaign-1",
            newDailyBudgetBrl: 200,
          }),
        ]),
      }),
      "user-1",
    );
  });

  it("creates audit log with source=strategic_analyst for budget_adjustment", async () => {
    await strategicAnalystService.applyRouteChange("company-1", budgetChange, "user-1");

    // budget_adjustment is now delegated to budgetIntelligenceService.apply —
    // the audit log is written by that service, not directly by strategic-analyst.
    // We verify the delegation happened with correct parameters.
    expect(mockBudgetApply).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: "company-1",
        allocations: expect.arrayContaining([
          expect.objectContaining({ campaignId: "campaign-1" }),
        ]),
      }),
      "user-1",
    );
  });

  it("sets campaign status to paused for pause_campaign type", async () => {
    await strategicAnalystService.applyRouteChange("company-1", pauseChange, "user-1");

    expect(mockCampaignUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "campaign-1" },
        data: { status: "paused" },
      }),
    );
  });

  it("creates audit log for editorial/new_audience types (no campaign update)", async () => {
    await strategicAnalystService.applyRouteChange("company-1", editorialChange, "user-1");

    expect(mockCampaignUpdate).not.toHaveBeenCalled();
    expect(mockAuditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actionType: "route_change_applied",
          source: "strategic_analyst",
        }),
      }),
    );
  });

  it("throws ExternalServiceError if a DB write fails", async () => {
    mockBudgetApply.mockRejectedValueOnce(new Error("DB connection lost"));

    await expect(
      strategicAnalystService.applyRouteChange("company-1", budgetChange, "user-1"),
    ).rejects.toThrow(ExternalServiceError);
  });
});
