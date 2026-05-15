import { companyRepository, type CompanyWithSocial } from "@server/repositories/company.repository";
import { NotFoundError, ValidationError } from "@server/lib/errors";
import { logger } from "@server/lib/logger";
import type { Company } from "@prisma/client";

export const companyService = {
  async getByUserId(userId: string): Promise<Company | null> {
    return companyRepository.findByUserId(userId);
  },

  async getWithSocialByUserId(userId: string): Promise<CompanyWithSocial | null> {
    return companyRepository.findByUserIdWithSocial(userId);
  },

  async upsert(
    userId: string,
    input: {
      name: string;
      description?: string;
      sector?: string;
      objective?: string;
      tone?: string;
      colors?: string[];
    },
  ): Promise<Company> {
    if (!input.name?.trim()) {
      throw new ValidationError("Company name is required");
    }
    if (input.name.length > 200) {
      throw new ValidationError("Company name must be 200 characters or less");
    }

    const colorsStr = Array.isArray(input.colors)
      ? JSON.stringify(input.colors)
      : null;

    const company = await companyRepository.upsert(userId, {
      name: input.name.trim(),
      description: input.description?.trim() ?? null,
      sector: input.sector?.trim() ?? null,
      objective: input.objective?.trim() ?? null,
      tone: input.tone ?? "professional",
      colors: colorsStr,
    });

    logger.info("[company] Upserted", { companyId: company.id, userId });
    return company;
  },

  async updateLogo(userId: string, logoUrl: string): Promise<Company> {
    const company = await companyRepository.findByUserId(userId);
    if (!company) throw new NotFoundError("Company");

    const updated = await companyRepository.updateLogo(userId, logoUrl);
    logger.info("[company] Logo updated", { companyId: company.id, userId });
    return updated;
  },
};
