import { costRepository } from "@server/repositories/cost.repository";
import { companyRepository } from "@server/repositories/company.repository";
import { NotFoundError } from "@server/lib/errors";
import type { CostLog } from "@prisma/client";

export interface CostSummary {
  totalCost: number;
  textCost: number;
  imageCost: number;
  textGenerations: number;
  imageGenerations: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalImages: number;
}

export interface DailyCost {
  date: string;
  text: number;
  image: number;
  total: number;
}

export const costService = {
  async getByUserId(
    userId: string,
    period: string,
  ): Promise<{ summary: CostSummary; daily: DailyCost[]; logs: CostLog[] }> {
    const company = await companyRepository.findByUserId(userId);
    if (!company) throw new NotFoundError("Company");

    const logs = await costRepository.findByCompanyId(company.id, period);

    // Build summary
    let textCost = 0;
    let imageCost = 0;
    let textGenerations = 0;
    let imageGenerations = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalImages = 0;

    for (const log of logs) {
      if (log.type === "text") {
        textCost += log.costUsd;
        textGenerations++;
        totalInputTokens += log.inputTokens;
        totalOutputTokens += log.outputTokens;
      } else {
        imageCost += log.costUsd;
        imageGenerations++;
        totalImages += log.images;
      }
    }

    // Build daily aggregation
    const dailyMap = new Map<string, { text: number; image: number }>();
    for (const log of logs) {
      const date = log.createdAt.toISOString().slice(0, 10);
      const existing = dailyMap.get(date) ?? { text: 0, image: 0 };
      if (log.type === "text") {
        existing.text += log.costUsd;
      } else {
        existing.image += log.costUsd;
      }
      dailyMap.set(date, existing);
    }

    const daily: DailyCost[] = Array.from(dailyMap.entries())
      .map(([date, v]) => ({ date, text: v.text, image: v.image, total: v.text + v.image }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      summary: {
        totalCost: textCost + imageCost,
        textCost,
        imageCost,
        textGenerations,
        imageGenerations,
        totalInputTokens,
        totalOutputTokens,
        totalImages,
      },
      daily,
      logs,
    };
  },
};
