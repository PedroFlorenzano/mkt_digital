/**
 * Unit tests for automation-rules.service.ts
 *
 * Tests create and evaluate with mocked repository and dependencies.
 */

import { automationRulesService, type CreateRuleInput } from "@server/services/automation-rules.service";
import type { AdMetricSnapshot, AutomationRule } from "@prisma/client";

jest.mock("@server/lib/prisma", () => ({
  prisma: {
    adCampaign: { findUnique: jest.fn() },
    campaignAuditLog: { create: jest.fn() },
    ruleExecutionLog: { create: jest.fn() },
    adMetricSnapshot: { findFirst: jest.fn() },
  },
}));
jest.mock("@server/repositories/automation-rules.repository", () => ({
  automationRulesRepository: {
    findActiveByCompany: jest.fn(),
    findByCompany: jest.fn(),
    create: jest.fn(),
    logExecution: jest.fn(),
  },
}));
jest.mock("@server/lib/meta-ads.connector", () => ({
  metaAdsConnector: { updateAdSetBudget: jest.fn(), pauseAdSet: jest.fn() },
}));
jest.mock("@server/lib/google-ads.connector", () => ({
  googleAdsConnector: { updateCampaignBudget: jest.fn(), pauseCampaign: jest.fn() },
}));
jest.mock("@server/services/credential.service", () => ({
  credentialService: { get: jest.fn() },
}));
jest.mock("@server/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { automationRulesRepository } from "@server/repositories/automation-rules.repository";
import { prisma } from "@server/lib/prisma";

const mockRepo = jest.mocked(automationRulesRepository);
const _mockRuleExecutionLog = jest.mocked(prisma.ruleExecutionLog.create);
const _mockCampaignFindUnique = jest.mocked(prisma.adCampaign.findUnique);

const mockRule: AutomationRule = {
  id: "rule-1",
  companyId: "company-1",
  campaignId: "campaign-1",
  name: "Pause when CTR < 1%",
  isActive: true,
  conditionJson: JSON.stringify({ metric: "ctr", operator: "lt", value: 0.01 }),
  actionJson: JSON.stringify({ type: "pause_ad" }),
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => jest.clearAllMocks());

describe("automationRulesService.create", () => {
  it("creates a rule with valid input and returns the rule", async () => {
    mockRepo.create.mockResolvedValue(mockRule);

    const input: CreateRuleInput = {
      companyId: "company-1",
      name: "Pause when CTR < 1%",
      condition: { metric: "ctr", operator: "lt", value: 0.01 },
      action: { type: "pause_ad" },
    };

    const result = await automationRulesService.create(input);

    expect(result.id).toBe("rule-1");
    expect(mockRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: "company-1",
        name: "Pause when CTR < 1%",
      }),
    );
  });

  it("serialises condition and action to JSON", async () => {
    mockRepo.create.mockResolvedValue(mockRule);

    const condition = { metric: "roas" as const, operator: "lt" as const, value: 1.5 };
    const action = { type: "increase_budget" as const, budgetIncreasePercent: 10 };

    await automationRulesService.create({
      companyId: "company-1",
      name: "Increase if ROAS drops",
      condition,
      action,
    });

    expect(mockRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        conditionJson: JSON.stringify(condition),
        actionJson: JSON.stringify(action),
      }),
    );
  });

  it("calls repository.create once per create call", async () => {
    mockRepo.create.mockResolvedValue(mockRule);

    await automationRulesService.create({
      companyId: "company-1",
      name: "Test Rule",
      condition: { metric: "ctr", operator: "lt", value: 0.01 },
      action: { type: "pause_ad" },
    });

    expect(mockRepo.create).toHaveBeenCalledTimes(1);
  });
});

describe("automationRulesService.evaluate", () => {
  const mockSnapshot: Partial<AdMetricSnapshot> = {
    campaignId: "campaign-1",
    ctr: 0.005, // below 0.01 → rule should trigger
    cpc: 1.5,
    roas: 2.0,
    spendBrl: 50,
    clicks: 5,
    conversions: 1,
  };

  it("returns satisfied=true when condition is met (CTR below threshold)", async () => {
    mockRepo.findActiveByCompany.mockResolvedValue([mockRule]);
    const metrics = new Map([["campaign-1", mockSnapshot as AdMetricSnapshot]]);

    const results = await automationRulesService.evaluate("company-1", metrics);

    expect(results).toHaveLength(1);
    expect(results[0]!.satisfied).toBe(true);
  });

  it("returns satisfied=false when condition is NOT met (CTR above threshold)", async () => {
    mockRepo.findActiveByCompany.mockResolvedValue([mockRule]);
    const goodSnapshot = { ...mockSnapshot, ctr: 0.05 }; // above 0.01
    const metrics = new Map([["campaign-1", goodSnapshot as AdMetricSnapshot]]);

    const results = await automationRulesService.evaluate("company-1", metrics);

    expect(results).toHaveLength(1);
    expect(results[0]!.satisfied).toBe(false);
  });

  it("returns empty array when there are no active rules", async () => {
    mockRepo.findActiveByCompany.mockResolvedValue([]);
    const metrics = new Map<string, AdMetricSnapshot>();

    const results = await automationRulesService.evaluate("company-1", metrics);
    expect(results).toEqual([]);
  });

  it("returns requiresConfirmation=false for pause_ad action", async () => {
    mockRepo.findActiveByCompany.mockResolvedValue([mockRule]);
    const metrics = new Map([["campaign-1", mockSnapshot as AdMetricSnapshot]]);

    const results = await automationRulesService.evaluate("company-1", metrics);
    expect(results[0]!.requiresConfirmation).toBe(false);
  });
});

describe("automationRulesService.listByCompany", () => {
  it("returns all rules for a company via repository.findByCompany", async () => {
    mockRepo.findByCompany.mockResolvedValue([mockRule]);

    const result = await automationRulesService.listByCompany("company-1");
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("rule-1");
    expect(mockRepo.findByCompany).toHaveBeenCalledWith("company-1");
  });

  it("returns empty array when no rules exist", async () => {
    mockRepo.findByCompany.mockResolvedValue([]);

    const result = await automationRulesService.listByCompany("company-1");
    expect(result).toEqual([]);
  });
});
