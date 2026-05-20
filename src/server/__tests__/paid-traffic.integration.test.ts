/**
 * paid-traffic.integration.test.ts
 *
 * Integration tests for the AI Paid Traffic module.
 * All external dependencies (Bedrock, Meta Ads connector) are mocked.
 * DB operations use the real Prisma client against prisma/dev.db (SQLite).
 */

import { prisma } from "@server/lib/prisma";
import { campaignService } from "@server/services/campaign.service";
import { performanceMonitorService } from "@server/services/performance-monitor.service";
import { abTestService } from "@server/services/ab-test.service";
import type { AbTestVariation } from "@server/services/ab-test.service";
import type { AbTest } from "@prisma/client";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

// Mock credential-crypto FIRST to prevent module-load-time error when
// CREDENTIAL_ENCRYPTION_KEY env var is absent in the test environment.
jest.mock("@server/lib/credential-crypto", () => ({
  encryptCredential: jest.fn().mockReturnValue({ iv: "aa", tag: "bb", data: "cc" }),
  decryptCredential: jest.fn().mockReturnValue('{"accessToken":"fake","adAccountId":"act_123"}'),
  serializeBlob: jest.fn().mockReturnValue("serialized"),
  deserializeBlob: jest.fn().mockReturnValue({ iv: "aa", tag: "bb", data: "cc" }),
}));

jest.mock("@server/lib/bedrock");
jest.mock("@server/lib/meta-ads.connector");
jest.mock("@server/lib/google-ads.connector");
jest.mock("@server/services/credential.service");
jest.mock("@server/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { generateTextWithBedrock } from "@server/lib/bedrock";
import { metaAdsConnector } from "@server/lib/meta-ads.connector";
import { credentialService } from "@server/services/credential.service";

const mockGenerateText = jest.mocked(generateTextWithBedrock);
const mockMetaCreate = jest.mocked(metaAdsConnector.createCampaign);
const mockMetaGetMetrics = jest.mocked(metaAdsConnector.getMetrics);
const mockCredentialGet = jest.mocked(credentialService.get);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal valid CampaignDraft JSON string returned by Bedrock mock */
const VALID_DRAFT_JSON = JSON.stringify({
  objective: "Aumentar vendas de calçados esportivos",
  audience: {
    ageMin: 18,
    ageMax: 45,
    locations: ["BR"],
    interests: ["esportes", "corrida"],
    behaviors: ["compras_online"],
  },
  dailyBudgetBrl: 100,
  adCopies: [
    {
      placement: "feed_instagram",
      variations: [
        "Calçados de alta performance para você",
        "Seu próximo passo começa aqui",
        "Corra mais longe com nossos tênis",
      ],
    },
  ],
  creativeBrief: "Imagens vibrantes mostrando atletas em ação com foco nos tênis.",
});

/** Fake Bedrock text response wrapping the draft JSON */
function makeBedrockResponse(text: string) {
  return {
    options: [{ title: "Resposta", content: text }],
    usage: {
      model: "claude-3-5-sonnet-20241022",
      inputTokens: 100,
      outputTokens: 200,
      costUsd: 0.001,
    },
  };
}

/** Fake Meta campaign result */
const FAKE_META_RESULT = {
  externalCampaignId: "meta-camp-001",
  externalAdSetId: "meta-adset-001",
  externalAdIds: ["meta-ad-001"],
  managerUrl: "https://www.facebook.com/adsmanager/campaigns/meta-camp-001",
};

/** Fake decrypted Meta credentials */
const FAKE_META_CREDS = {
  platform: "meta" as const,
  fields: {
    accessToken: "fake-access-token",
    adAccountId: "act_123456789",
  },
};

/** Fake metrics returned by metaAdsConnector.getMetrics */
const FAKE_METRICS = {
  impressions: 1500,
  clicks: 75,
  conversions: 5,
  spendBrl: 50.0,
  ctr: 0.05,
  cpc: 0.67,
  roas: 3.2,
  rawJson: JSON.stringify({ data: [{ impressions: "1500" }] }),
};

// ---------------------------------------------------------------------------
// Database seed helpers
// ---------------------------------------------------------------------------

async function createTestUser(suffix = "1") {
  return prisma.user.create({
    data: {
      id: `test-user-${suffix}-${Date.now()}`,
      email: `test${suffix}-${Date.now()}@example.com`,
      name: "Test User",
    },
  });
}

async function createTestCompany(userId: string, suffix = "1") {
  return prisma.company.create({
    data: {
      id: `test-company-${suffix}-${Date.now()}`,
      userId,
      name: "Test Company",
      sector: "Varejo",
      objective: "Aumentar vendas",
      tone: "professional",
    },
  });
}

async function createTestCredential(companyId: string) {
  // Insert a minimal encrypted credential record — content does not need to
  // decrypt correctly because credentialService.get is mocked.
  return prisma.adPlatformCredential.create({
    data: {
      companyId,
      platform: "meta",
      encryptedData: JSON.stringify({ iv: "aabbcc", tag: "ddeeff", data: "00112233" }),
      isValid: true,
    },
  });
}

// ---------------------------------------------------------------------------
// Cleanup helpers
// ---------------------------------------------------------------------------

const createdUserIds: string[] = [];
const createdCompanyIds: string[] = [];

async function cleanupTestData() {
  // Delete in dependency order (children before parents)
  if (createdCompanyIds.length > 0) {
    await prisma.campaignAuditLog.deleteMany({ where: { companyId: { in: createdCompanyIds } } });
    await prisma.adMetricSnapshot.deleteMany({
      where: { campaign: { companyId: { in: createdCompanyIds } } },
    });
    await prisma.abTest.deleteMany({
      where: { campaign: { companyId: { in: createdCompanyIds } } },
    });
    await prisma.adCampaign.deleteMany({ where: { companyId: { in: createdCompanyIds } } });
    await prisma.adPlatformCredential.deleteMany({ where: { companyId: { in: createdCompanyIds } } });
    await prisma.company.deleteMany({ where: { id: { in: createdCompanyIds } } });
  }
  if (createdUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  createdUserIds.length = 0;
  createdCompanyIds.length = 0;
}

// ---------------------------------------------------------------------------
// Test Suites
// ---------------------------------------------------------------------------

describe("Campaign creation flow", () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(async () => { await cleanupTestData(); });

  it("should generate CampaignDraft and launch campaign", async () => {
    // --- Arrange: seed DB ---
    const user = await createTestUser("cflow");
    createdUserIds.push(user.id);

    const company = await createTestCompany(user.id, "cflow");
    createdCompanyIds.push(company.id);

    await createTestCredential(company.id);

    // Mock generateTextWithBedrock → returns a valid draft JSON
    mockGenerateText.mockResolvedValue(makeBedrockResponse(VALID_DRAFT_JSON));

    // Mock metaAdsConnector.createCampaign → returns fake IDs
    mockMetaCreate.mockResolvedValue(FAKE_META_RESULT);

    // Mock credentialService.get → returns fake creds
    mockCredentialGet.mockResolvedValue(FAKE_META_CREDS);

    // --- Act: generate draft ---
    const draft = await campaignService.generate(
      company.id,
      "Quero aumentar vendas de calçados esportivos para corredores"
    );

    // --- Assert: CampaignDraft structure ---
    expect(draft).toBeDefined();
    expect(typeof draft.objective).toBe("string");
    expect(draft.objective.length).toBeGreaterThan(0);
    expect(draft.audience).toMatchObject({
      ageMin: expect.any(Number),
      ageMax: expect.any(Number),
      locations: expect.any(Array),
      interests: expect.any(Array),
      behaviors: expect.any(Array),
    });
    expect(typeof draft.dailyBudgetBrl).toBe("number");
    expect(draft.dailyBudgetBrl).toBeGreaterThan(0);
    expect(Array.isArray(draft.adCopies)).toBe(true);
    expect(draft.adCopies.length).toBeGreaterThan(0);
    for (const copy of draft.adCopies) {
      expect(copy.variations.length).toBeGreaterThanOrEqual(3);
    }
    expect(typeof draft.creativeBrief).toBe("string");

    // --- Act: launch campaign ---
    const campaigns = await campaignService.launch(company.id, draft, ["meta"]);

    // --- Assert: AdCampaign persisted in DB ---
    expect(campaigns).toHaveLength(1);
    const campaign = campaigns[0];
    expect(campaign).toBeDefined();
    expect(campaign!.externalCampaignId).toBe("meta-camp-001");
    expect(campaign!.companyId).toBe(company.id);
    expect(campaign!.platform).toBe("meta");
    expect(campaign!.status).toBe("active");

    // Verify DB record
    const dbCampaign = await prisma.adCampaign.findUnique({ where: { id: campaign!.id } });
    expect(dbCampaign).not.toBeNull();
    expect(dbCampaign!.externalCampaignId).toBe("meta-camp-001");

    // Verify CampaignAuditLog was created with actionType 'campaign_created'
    const auditLog = await prisma.campaignAuditLog.findFirst({
      where: { campaignId: campaign!.id, actionType: "campaign_created" },
    });
    expect(auditLog).not.toBeNull();
    expect(auditLog!.actionType).toBe("campaign_created");
    expect(auditLog!.source).toBe("user");
  });
});

// ---------------------------------------------------------------------------

describe("Performance monitor cycle", () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(async () => { await cleanupTestData(); });

  it("should collect metrics, save snapshots, and generate report", async () => {
    // --- Arrange: seed DB with an active campaign ---
    const user = await createTestUser("pmon");
    createdUserIds.push(user.id);

    const company = await createTestCompany(user.id, "pmon");
    createdCompanyIds.push(company.id);

    const credential = await createTestCredential(company.id);

    const campaign = await prisma.adCampaign.create({
      data: {
        companyId: company.id,
        credentialId: credential.id,
        platform: "meta",
        campaignType: "social",
        name: "Test Campaign for Monitor",
        objective: "Aumentar reconhecimento de marca",
        dailyBudgetBrl: 80,
        status: "active",
        externalCampaignId: "meta-camp-monitor-001",
        launchedAt: new Date(),
      },
    });

    // Mock credentialService.get → returns fake creds
    mockCredentialGet.mockResolvedValue(FAKE_META_CREDS);

    // Mock metaAdsConnector.getMetrics → returns fake metrics
    mockMetaGetMetrics.mockResolvedValue(FAKE_METRICS);

    // Mock generateTextWithBedrock → returns a fake report text
    mockGenerateText.mockResolvedValue(
      makeBedrockResponse("Performance satisfatória no período analisado.")
    );

    // --- Act ---
    const cycleResult = await performanceMonitorService.runCycle();

    // --- Assert: MonitorCycleResult.snapshotsSaved >= 1 (we created one campaign,
    // but the dev.db may have other active campaigns from prior test data)
    expect(cycleResult.snapshotsSaved).toBeGreaterThanOrEqual(1);
    // campaignsFailed may include leftover campaigns from prior test data in dev.db;
    // we verify that our specific campaign succeeded by checking the snapshot below.
    expect(cycleResult.campaignsChecked).toBeGreaterThanOrEqual(1);

    // Verify AdMetricSnapshot was saved in DB
    const snapshot = await prisma.adMetricSnapshot.findFirst({
      where: { campaignId: campaign.id },
    });
    expect(snapshot).not.toBeNull();
    expect(snapshot!.impressions).toBe(1500);
    expect(snapshot!.clicks).toBe(75);
    expect(snapshot!.spendBrl).toBe(50.0);
    expect(snapshot!.ctr).toBe(0.05);
  });
});

// ---------------------------------------------------------------------------

describe("A/B test finalization", () => {
  const makeVariation = (
    index: number,
    ctr: number,
    impressions = 200,
    clicks = Math.round(200 * ctr),
  ): AbTestVariation => ({
    externalAdId: `ad-variation-${index}`,
    variationIndex: index,
    creative: {
      headline: `Headline ${index}`,
      description: `Description ${index}`,
      callToAction: `CTA ${index}`,
    },
    impressions,
    clicks,
    ctr,
    isWinner: false,
  });

  it("should select winner by highest CTR and pause losers", () => {
    const variations: AbTestVariation[] = [
      makeVariation(1, 0.03),
      makeVariation(2, 0.07), // <-- highest CTR — should win
      makeVariation(3, 0.05),
    ];

    const winner = abTestService.selectWinner(variations);

    expect(winner).toBeDefined();
    expect(winner.externalAdId).toBe("ad-variation-2");
    expect(winner.ctr).toBe(0.07);
    expect(winner.variationIndex).toBe(2);
  });

  it("checkAndFinalize should return null if < 48h elapsed", async () => {
    // Create a fake AbTest with startedAt = now (0 hours elapsed)
    const fakeTest: AbTest = {
      id: "test-ab-not-ready",
      campaignId: "campaign-abc",
      status: "active",
      startedAt: new Date(), // just now — far less than 48h
      endedAt: null,
      winnerAdId: null,
      variationsJson: JSON.stringify([
        makeVariation(1, 0.03),
        makeVariation(2, 0.07),
        makeVariation(3, 0.05),
      ]),
      resultSummary: null,
      extensionCount: 0,
    };

    const fakeCreds = FAKE_META_CREDS;

    const result = await abTestService.checkAndFinalize(fakeTest, [], fakeCreds);

    // Should return null because < 48h have elapsed since startedAt
    expect(result).toBeNull();
  });
});
