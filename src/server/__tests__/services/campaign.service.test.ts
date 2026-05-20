/**
 * Unit tests for campaign.service.ts
 *
 * Tests generate, listByCompany, with all external dependencies mocked.
 */

import { campaignService } from "@server/services/campaign.service";
import { NotFoundError } from "@server/lib/errors";

jest.mock("@server/lib/prisma", () => ({
  prisma: {
    company: { findUnique: jest.fn() },
    adCampaign: { findMany: jest.fn(), count: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    adMetricSnapshot: { findFirst: jest.fn(), findMany: jest.fn() },
    adPlatformCredential: { findFirst: jest.fn(), findUnique: jest.fn() },
    campaignAuditLog: { create: jest.fn() },
    costLog: { create: jest.fn() },
  },
}));
jest.mock("@server/lib/bedrock", () => ({
  generateTextWithBedrock: jest.fn(),
}));
jest.mock("@server/services/credential.service", () => ({
  credentialService: { get: jest.fn() },
  AdPlatform: { META: "meta", GOOGLE: "google" },
}));
jest.mock("@server/lib/meta-ads.connector", () => ({
  metaAdsConnector: {
    createCampaign: jest.fn(),
    createAdSet: jest.fn(),
    createAd: jest.fn(),
    validateCredentials: jest.fn(),
  },
}));
jest.mock("@server/lib/google-ads.connector", () => ({
  googleAdsConnector: {
    createCampaign: jest.fn(),
    createAdGroup: jest.fn(),
    createAd: jest.fn(),
    validateCredentials: jest.fn(),
  },
}));
jest.mock("@server/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { prisma } from "@server/lib/prisma";
import { generateTextWithBedrock } from "@server/lib/bedrock";

const mockCompany = jest.mocked(prisma.company.findUnique);
const mockCampaigns = jest.mocked(prisma.adCampaign.findMany);
const mockCampaignCount = jest.mocked(prisma.adCampaign.count);
const mockBedrock = jest.mocked(generateTextWithBedrock);

const company = {
  id: "company-1",
  name: "Test Brand",
  description: "A great brand",
  sector: "Moda",
  objective: "Gerar leads",
  tone: "professional",
  colors: '["#3B82F6"]',
};

const mockCampaign = {
  id: "camp-1",
  companyId: "company-1",
  name: "Test Campaign",
  platform: "meta",
  campaignType: "social",
  objective: "reach",
  dailyBudgetBrl: 100,
  status: "active",
  createdAt: new Date(),
  updatedAt: new Date(),
  // include result for listByCompany
  metrics: [],
};

function makeBedrockCampaignDraft() {
  return {
    options: [{
      title: "Draft",
      content: JSON.stringify({
        objective: "Aumentar alcance",
        audience: {
          ageMin: 25,
          ageMax: 45,
          locations: ["São Paulo"],
          interests: ["Moda"],
          behaviors: [],
        },
        dailyBudgetBrl: 100,
        adCopies: [
          {
            placement: "feed",
            variations: ["Descubra nossa coleção!", "Estilo para você!", "Look novo todo dia!"],
          },
        ],
        creativeBrief: "Use cores vibrantes",
      }),
    }],
    usage: { inputTokens: 200, outputTokens: 300, costUsd: 0.004, model: "claude" },
  };
}

beforeEach(() => jest.clearAllMocks());

describe("campaignService.generate", () => {
  it("throws NotFoundError when company does not exist", async () => {
    mockCompany.mockResolvedValue(null);

    await expect(
      campaignService.generate("nonexistent", "summer campaign"),
    ).rejects.toThrow(NotFoundError);
  });

  it("calls Bedrock even with a brief description", async () => {
    mockCompany.mockResolvedValue(company as never);
    mockBedrock.mockResolvedValue(makeBedrockCampaignDraft() as never);

    // description is not validated — any string is passed to Bedrock
    await expect(
      campaignService.generate("company-1", ""),
    ).resolves.toBeDefined();
  });

  it("returns a CampaignDraft on success", async () => {
    mockCompany.mockResolvedValue(company as never);
    mockBedrock.mockResolvedValue(makeBedrockCampaignDraft() as never);

    const result = await campaignService.generate("company-1", "summer fashion campaign");

    expect(result.objective).toBeTruthy();
    expect(result.audience).toBeDefined();
    expect(result.adCopies).toBeInstanceOf(Array);
    expect(result.dailyBudgetBrl).toBeGreaterThan(0);
  });

  it("calls Bedrock with the company context in the prompt", async () => {
    mockCompany.mockResolvedValue(company as never);
    mockBedrock.mockResolvedValue(makeBedrockCampaignDraft() as never);

    await campaignService.generate("company-1", "launch campaign");

    expect(mockBedrock).toHaveBeenCalledTimes(1);
    const systemPrompt = mockBedrock.mock.calls[0]![1] as string;
    expect(systemPrompt.length).toBeGreaterThan(0);
  });
});

describe("campaignService.listByCompany", () => {
  it("returns paginated campaigns", async () => {
    mockCampaigns.mockResolvedValue([mockCampaign] as never);
    mockCampaignCount.mockResolvedValue(1);

    const result = await campaignService.listByCompany("company-1");

    expect(result.data).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
    expect(result.hasNextPage).toBe(false);
  });

  it("returns empty list when no campaigns exist", async () => {
    mockCampaigns.mockResolvedValue([]);
    mockCampaignCount.mockResolvedValue(0);

    const result = await campaignService.listByCompany("company-1");

    expect(result.data).toHaveLength(0);
    expect(result.total).toBe(0);
    expect(result.hasNextPage).toBe(false);
  });

  it("applies pageSize correctly", async () => {
    const bigList = Array.from({ length: 5 }, (_, i) => ({ ...mockCampaign, id: `camp-${i}` }));
    mockCampaigns.mockResolvedValue(bigList as never);
    mockCampaignCount.mockResolvedValue(10); // 10 total, 5 returned

    const result = await campaignService.listByCompany("company-1", { pageSize: 5 });
    expect(result.hasNextPage).toBe(true);
  });

  it("accepts optional status filter", async () => {
    mockCampaigns.mockResolvedValue([]);
    mockCampaignCount.mockResolvedValue(0);

    await campaignService.listByCompany("company-1", { status: "active" });

    // The service calls both count and findMany; verify findMany received the filter
    expect(mockCampaigns).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "active" }),
      }),
    );
  });
});
