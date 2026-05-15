import { prisma } from "@/lib/prisma";
import type { CostLog } from "@prisma/client";

export interface CreateCostData {
  companyId: string;
  type: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  images?: number;
  costUsd: number;
  metadata?: string;
}

function getPeriodStart(period: string): Date {
  const now = new Date();
  switch (period) {
    case "week": {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      return d;
    }
    case "year": {
      const d = new Date(now);
      d.setFullYear(d.getFullYear() - 1);
      return d;
    }
    case "all":
      return new Date(0);
    case "month":
    default: {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 1);
      return d;
    }
  }
}

export const costRepository = {
  create(data: CreateCostData): Promise<CostLog> {
    return prisma.costLog.create({ data });
  },

  findByCompanyId(
    companyId: string,
    period: string,
    options: { take?: number; skip?: number } = {},
  ): Promise<CostLog[]> {
    return prisma.costLog.findMany({
      where: {
        companyId,
        createdAt: { gte: getPeriodStart(period) },
      },
      orderBy: { createdAt: "desc" },
      take: options.take ?? 100,
      skip: options.skip ?? 0,
    });
  },

  sumByCompanyId(
    companyId: string,
    period: string,
  ): Promise<{
    _sum: {
      costUsd: number | null;
      inputTokens: number | null;
      outputTokens: number | null;
      images: number | null;
    };
    _count: { id: number };
  }> {
    return prisma.costLog.aggregate({
      where: {
        companyId,
        createdAt: { gte: getPeriodStart(period) },
      },
      _sum: { costUsd: true, inputTokens: true, outputTokens: true, images: true },
      _count: { id: true },
    });
  },
};
