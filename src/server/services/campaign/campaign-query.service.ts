/**
 * campaign-query.service.ts
 * Read/query operations for campaigns.
 */

import { prisma } from "@server/lib/prisma";
import type { AdCampaignWithLatestMetrics } from "./campaign.types";

export async function listByCompany(
  companyId: string,
  options?: { page?: number; pageSize?: number; status?: string },
): Promise<{
  data: AdCampaignWithLatestMetrics[];
  total: number;
  page: number;
  pageSize: number;
  hasNextPage: boolean;
}> {
  const page = Math.max(1, options?.page ?? 1);
  const pageSize = Math.max(1, Math.min(100, options?.pageSize ?? 20));
  const skip = (page - 1) * pageSize;

  const where = {
    companyId,
    ...(options?.status ? { status: options.status } : {}),
  };

  const [total, campaigns] = await Promise.all([
    prisma.adCampaign.count({ where }),
    prisma.adCampaign.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: "desc" },
      include: { metrics: { orderBy: { collectedAt: "desc" }, take: 1 } },
    }),
  ]);

  const data: AdCampaignWithLatestMetrics[] = campaigns.map((c) => {
    const { metrics, ...rest } = c;
    return { ...rest, latestMetrics: metrics[0] ?? null };
  });

  return { data, total, page, pageSize, hasNextPage: skip + pageSize < total };
}
