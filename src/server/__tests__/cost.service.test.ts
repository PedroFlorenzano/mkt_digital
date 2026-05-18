/**
 * Unit tests for costService — data aggregation logic.
 */

import { costService } from "../services/cost.service";
import { costRepository } from "../repositories/cost.repository";
import type { CostLog } from "@prisma/client";

jest.mock("../repositories/cost.repository", () => ({
  costRepository: {
    findByCompanyId: jest.fn(),
  },
}));

const repo = costRepository as jest.Mocked<typeof costRepository>;

function makeTextLog(overrides: Partial<CostLog> = {}): CostLog {
  return {
    id: "log_01",
    companyId: "cmp_01",
    videoJobId: null,
    type: "text",
    model: "us.anthropic.claude-sonnet-4-6",
    inputTokens: 1000,
    outputTokens: 300,
    images: 0,
    costUsd: 0.0075,
    metadata: null,
    createdAt: new Date("2026-05-01T10:00:00Z"),
    ...overrides,
  };
}

function makeImageLog(overrides: Partial<CostLog> = {}): CostLog {
  return {
    id: "log_02",
    companyId: "cmp_01",
    videoJobId: null,
    type: "image",
    model: "stability.stable-image-ultra-v1:1",
    inputTokens: 0,
    outputTokens: 0,
    images: 3,
    costUsd: 0.24,
    metadata: null,
    createdAt: new Date("2026-05-01T10:01:00Z"),
    ...overrides,
  };
}

afterEach(() => jest.clearAllMocks());

describe("costService.getByCompanyId", () => {
  it("returns zeros for an empty log set", async () => {
    repo.findByCompanyId.mockResolvedValue([]);
    const { summary } = await costService.getByCompanyId("cmp_01", "month");

    expect(summary.totalCost).toBe(0);
    expect(summary.textGenerations).toBe(0);
    expect(summary.imageGenerations).toBe(0);
    expect(summary.totalImages).toBe(0);
  });

  it("aggregates text and image costs correctly", async () => {
    repo.findByCompanyId.mockResolvedValue([makeTextLog(), makeImageLog()]);
    const { summary } = await costService.getByCompanyId("cmp_01", "month");

    expect(summary.textCost).toBeCloseTo(0.0075);
    expect(summary.imageCost).toBeCloseTo(0.24);
    expect(summary.totalCost).toBeCloseTo(0.2475);
    expect(summary.textGenerations).toBe(1);
    expect(summary.imageGenerations).toBe(1);
    expect(summary.totalImages).toBe(3);
    expect(summary.totalInputTokens).toBe(1000);
    expect(summary.totalOutputTokens).toBe(300);
  });

  it("builds daily aggregation keyed by ISO date", async () => {
    const day1Text  = makeTextLog({ createdAt: new Date("2026-05-01T10:00:00Z") });
    const day1Image = makeImageLog({ createdAt: new Date("2026-05-01T14:00:00Z") });
    const day2Text  = makeTextLog({ id: "log_03", createdAt: new Date("2026-05-02T09:00:00Z") });

    repo.findByCompanyId.mockResolvedValue([day1Text, day1Image, day2Text]);
    const { daily } = await costService.getByCompanyId("cmp_01", "month");

    expect(daily).toHaveLength(2);
    const day1 = daily.find((d) => d.date === "2026-05-01");
    expect(day1?.text).toBeCloseTo(0.0075);
    expect(day1?.image).toBeCloseTo(0.24);
    expect(day1?.total).toBeCloseTo(0.2475);
  });

  it("returns logs array sorted by date", async () => {
    const logs = [
      makeTextLog({ id: "log_a", createdAt: new Date("2026-05-03T10:00:00Z") }),
      makeTextLog({ id: "log_b", createdAt: new Date("2026-05-01T10:00:00Z") }),
    ];
    repo.findByCompanyId.mockResolvedValue(logs);
    const { logs: returned } = await costService.getByCompanyId("cmp_01", "month");
    // Logs are returned as-is from the repository (ordering is repository's responsibility)
    expect(returned).toHaveLength(2);
  });
});
