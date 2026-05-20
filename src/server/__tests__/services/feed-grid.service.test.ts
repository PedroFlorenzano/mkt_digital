/**
 * Unit + property tests for feed-grid.service.ts
 *
 * Covers:
 *  - getFeedGrid: sorting, filtering by platform
 *  - reorderGrid: P8.1 (published posts never reordered), error cases
 */

import {
  getFeedGrid,
  reorderGrid,
} from "@server/services/feed-grid.service";
import { NotFoundError, ForbiddenError, ValidationError } from "@server/lib/errors";

// Mock prisma
jest.mock("@server/lib/prisma", () => ({
  prisma: {
    post: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

import { prisma } from "@server/lib/prisma";

const mockFindMany = jest.mocked(prisma.post.findMany);
const mockFindUnique = jest.mocked(prisma.post.findUnique);
const mockUpdate = jest.mocked(prisma.post.update);

const now = new Date("2026-05-20T10:00:00Z");

function makePost(overrides: Partial<{
  id: string;
  companyId: string;
  status: string;
  platform: string;
  publishedAt: Date | null;
  scheduledAt: Date | null;
  gridOrder: number | null;
  imageUrl: string | null;
  content: string | null;
  format: string | null;
  createdAt: Date;
  slidesJson: string | null;
  boostSuggestionJson: string | null;
  boostCampaignId: string | null;
}> = {}) {
  return {
    id: "post-1",
    companyId: "company-1",
    status: "draft",
    platform: "instagram",
    publishedAt: null,
    scheduledAt: null,
    gridOrder: null,
    imageUrl: null,
    content: "Test content",
    format: "post",
    createdAt: now,
    slidesJson: null,
    boostSuggestionJson: null,
    boostCampaignId: null,
    ...overrides,
  };
}

beforeEach(() => jest.clearAllMocks());

describe("getFeedGrid", () => {
  it("returns empty array when no posts exist", async () => {
    mockFindMany.mockResolvedValue([]);

    const result = await getFeedGrid("company-1");
    expect(result).toEqual([]);
  });

  it("queries only instagram posts", async () => {
    mockFindMany.mockResolvedValue([]);

    await getFeedGrid("company-1");

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          platform: "instagram",
        }),
      }),
    );
  });

  it("queries only published, scheduled, draft posts", async () => {
    mockFindMany.mockResolvedValue([]);

    await getFeedGrid("company-1");

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ["published", "scheduled", "draft"] },
        }),
      }),
    );
  });

  it("returns posts sorted: published first", async () => {
    const published = makePost({
      id: "pub-1",
      status: "published",
      publishedAt: new Date("2026-05-19T08:00:00Z"),
    });
    const draft = makePost({ id: "draft-1", status: "draft" });
    const scheduled = makePost({
      id: "sched-1",
      status: "scheduled",
      scheduledAt: new Date("2026-05-21T10:00:00Z"),
    });

    mockFindMany.mockResolvedValue([draft, published, scheduled]);

    const result = await getFeedGrid("company-1");

    expect(result[0]!.id).toBe("pub-1");
  });

  it("P8.1 property: published posts always come before non-published in the result", async () => {
    const posts = [
      makePost({ id: "d1", status: "draft", createdAt: new Date("2026-05-01T00:00:00Z") }),
      makePost({ id: "p1", status: "published", publishedAt: new Date("2026-05-15T00:00:00Z") }),
      makePost({ id: "s1", status: "scheduled", scheduledAt: new Date("2026-05-22T00:00:00Z") }),
      makePost({ id: "p2", status: "published", publishedAt: new Date("2026-05-10T00:00:00Z") }),
    ];

    mockFindMany.mockResolvedValue(posts);
    const result = await getFeedGrid("company-1");

    const publishedPositions = result
      .map((p, i) => ({ status: p.status, idx: i }))
      .filter((p) => p.status === "published")
      .map((p) => p.idx);

    const futurePositions = result
      .map((p, i) => ({ status: p.status, idx: i }))
      .filter((p) => p.status !== "published")
      .map((p) => p.idx);

    // All published indices must be less than all future indices
    if (publishedPositions.length > 0 && futurePositions.length > 0) {
      expect(Math.max(...publishedPositions)).toBeLessThan(Math.min(...futurePositions));
    }
  });

  it("sorts published posts by publishedAt descending", async () => {
    const older = makePost({ id: "p-old", status: "published", publishedAt: new Date("2026-05-01T00:00:00Z") });
    const newer = makePost({ id: "p-new", status: "published", publishedAt: new Date("2026-05-15T00:00:00Z") });

    mockFindMany.mockResolvedValue([older, newer]);
    const result = await getFeedGrid("company-1");

    expect(result[0]!.id).toBe("p-new");
    expect(result[1]!.id).toBe("p-old");
  });
});

describe("reorderGrid", () => {
  it("throws NotFoundError when post does not exist", async () => {
    mockFindUnique.mockResolvedValue(null);

    await expect(reorderGrid("company-1", "post-999", 2)).rejects.toThrow(NotFoundError);
  });

  it("throws ForbiddenError when post belongs to a different company", async () => {
    mockFindUnique.mockResolvedValue(
      makePost({ id: "post-1", companyId: "other-company" }) as never,
    );

    await expect(reorderGrid("company-1", "post-1", 2)).rejects.toThrow(ForbiddenError);
  });

  it("P8.1 – throws ValidationError when post is published (immutable order)", async () => {
    mockFindUnique.mockResolvedValue(
      makePost({ id: "post-1", companyId: "company-1", status: "published" }) as never,
    );

    await expect(reorderGrid("company-1", "post-1", 0)).rejects.toThrow(ValidationError);
  });

  it("updates gridOrder for a draft post", async () => {
    mockFindUnique.mockResolvedValue(
      makePost({ id: "post-1", companyId: "company-1", status: "draft" }) as never,
    );
    mockUpdate.mockResolvedValue({} as never);

    await reorderGrid("company-1", "post-1", 3);

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "post-1" },
      data: { gridOrder: 3 },
    });
  });

  it("updates gridOrder for a scheduled post", async () => {
    mockFindUnique.mockResolvedValue(
      makePost({ id: "post-2", companyId: "company-1", status: "scheduled" }) as never,
    );
    mockUpdate.mockResolvedValue({} as never);

    await reorderGrid("company-1", "post-2", 0);

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "post-2" },
      data: { gridOrder: 0 },
    });
  });

  it("does not call update when post is published (throws before update)", async () => {
    mockFindUnique.mockResolvedValue(
      makePost({ status: "published", companyId: "company-1" }) as never,
    );

    await expect(reorderGrid("company-1", "post-1", 0)).rejects.toThrow(ValidationError);
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
