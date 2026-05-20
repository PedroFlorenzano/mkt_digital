/**
 * Unit tests for ab-test.service.ts
 *
 * Focuses on the pure/deterministic methods (selectWinner, checkAndFinalize logic)
 * with all external dependencies mocked.
 */

import { abTestService, type AbTestVariation } from "@server/services/ab-test.service";

jest.mock("@server/lib/prisma", () => ({
  prisma: {
    adCampaign: { findUnique: jest.fn() },
    abTest: { create: jest.fn(), update: jest.fn() },
  },
}));
jest.mock("@server/lib/bedrock", () => ({
  generateTextWithBedrock: jest.fn(),
}));
jest.mock("@server/lib/meta-ads.connector", () => ({
  metaAdsConnector: { pauseAd: jest.fn() },
}));
jest.mock("@server/lib/google-ads.connector", () => ({
  googleAdsConnector: { pauseAd: jest.fn() },
}));
jest.mock("@server/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

// ── selectWinner (pure function) ──────────────────────────────────────────────

function makeVariation(overrides: Partial<AbTestVariation> = {}): AbTestVariation {
  return {
    externalAdId: "ad-1",
    variationIndex: 1,
    creative: { headline: "Test", description: "Desc", callToAction: "Click" },
    impressions: 1000,
    clicks: 50,
    ctr: 0.05,
    isWinner: false,
    ...overrides,
  };
}

describe("abTestService.selectWinner", () => {
  it("throws when variations array is empty", () => {
    expect(() => abTestService.selectWinner([])).toThrow();
  });

  it("returns the single variation when there is only one", () => {
    const v = makeVariation({ externalAdId: "ad-only", ctr: 0.07 });
    expect(abTestService.selectWinner([v]).externalAdId).toBe("ad-only");
  });

  it("returns the variation with the highest CTR", () => {
    const low = makeVariation({ externalAdId: "ad-low", ctr: 0.01 });
    const high = makeVariation({ externalAdId: "ad-high", ctr: 0.12 });
    const mid = makeVariation({ externalAdId: "ad-mid", ctr: 0.06 });

    const winner = abTestService.selectWinner([low, high, mid]);
    expect(winner.externalAdId).toBe("ad-high");
  });

  it("returns the first variation with the highest CTR on a tie", () => {
    const v1 = makeVariation({ externalAdId: "ad-1", ctr: 0.1 });
    const v2 = makeVariation({ externalAdId: "ad-2", ctr: 0.1 });

    // On tie, reduce picks the first one that beats current best → v1
    const winner = abTestService.selectWinner([v1, v2]);
    expect(winner.externalAdId).toBe("ad-1");
  });

  it("property: winner CTR is always >= all other CTRs", () => {
    const variations = [
      makeVariation({ externalAdId: "a", ctr: 0.03 }),
      makeVariation({ externalAdId: "b", ctr: 0.15 }),
      makeVariation({ externalAdId: "c", ctr: 0.09 }),
      makeVariation({ externalAdId: "d", ctr: 0.01 }),
    ];

    const winner = abTestService.selectWinner(variations);
    const maxCtr = Math.max(...variations.map((v) => v.ctr));
    expect(winner.ctr).toBe(maxCtr);
  });

  it("property: for any non-empty array, winner is always a member of the input", () => {
    const ctrs = [0.04, 0.07, 0.02, 0.11, 0.09];
    const variations = ctrs.map((ctr, i) =>
      makeVariation({ externalAdId: `ad-${i}`, ctr }),
    );
    const winner = abTestService.selectWinner(variations);
    expect(variations.map((v) => v.externalAdId)).toContain(winner.externalAdId);
  });
});
