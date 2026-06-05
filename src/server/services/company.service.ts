import { companyRepository, type CompanyWithSocial } from "@server/repositories/company.repository";
import { ForbiddenError, NotFoundError, ValidationError } from "@server/lib/errors";
import { assertCompanyLimit } from "@server/lib/plan-guard";
import { logger } from "@server/lib/logger";
import type { Company } from "@prisma/client";
import type { CompanyInput, CompanySummary } from "@/types/company";

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

  // ─────────────────────────────────────────────
  // New multi-company methods
  // ─────────────────────────────────────────────

  /**
   * Returns all companies belonging to the user, ordered alphabetically.
   *
   * Post-conditions:
   *   - Returns array (possibly empty) ordered alphabetically
   *   - ∀ c ∈ result: c.userId === userId (guaranteed by repository)
   */
  async listByUserId(userId: string): Promise<CompanySummary[]> {
    return companyRepository.findAllByUserId(userId);
  },

  /**
   * Creates a new company after plan limit and name validation.
   *
   * Post-conditions:
   *   - Throws ValidationError if name is invalid (< 2 or > 200 chars after trim)
   *   - Throws ForbiddenError if plan does not allow more companies
   *   - Returns created Company with a unique id
   *   - countByUserId(userId) increases by exactly 1
   */
  async createCompany(userId: string, input: CompanyInput): Promise<Company> {
    const trimmedName = input.name?.trim() ?? "";
    if (trimmedName.length < 2 || trimmedName.length > 200) {
      throw new ValidationError(
        "O nome da empresa deve ter entre 2 e 200 caracteres.",
      );
    }

    const currentCount = await companyRepository.countByUserId(userId);
    await assertCompanyLimit(userId, currentCount);

    const colorsStr = Array.isArray(input.colors)
      ? JSON.stringify(input.colors)
      : null;

    const company = await companyRepository.create(userId, {
      name: trimmedName,
      description: input.description?.trim() ?? null,
      sector: input.sector?.trim() ?? null,
      objective: input.objective?.trim() ?? null,
      tone: input.tone ?? "professional",
      colors: colorsStr,
    });

    logger.info("[company] Created", { companyId: company.id, userId });
    return company;
  },

  /**
   * Validates and updates an existing company's fields.
   *
   * Post-conditions:
   *   - Throws ValidationError if name is provided but invalid
   *   - Returns Company with updated fields
   *   - Fields not provided retain their previous values
   */
  async updateCompany(
    userId: string,
    companyId: string,
    input: Partial<CompanyInput>,
  ): Promise<Company> {
    if (input.name !== undefined) {
      const trimmedName = input.name.trim();
      if (trimmedName.length < 2 || trimmedName.length > 200) {
        throw new ValidationError(
          "O nome da empresa deve ter entre 2 e 200 caracteres.",
        );
      }
      input = { ...input, name: trimmedName };
    }

    const colorsStr =
      input.colors !== undefined
        ? Array.isArray(input.colors)
          ? JSON.stringify(input.colors)
          : null
        : undefined;

    const updateData: Record<string, unknown> = {};
    if (input.name !== undefined) updateData.name = input.name.trim();
    if (input.description !== undefined)
      updateData.description = input.description?.trim() ?? null;
    if (input.sector !== undefined)
      updateData.sector = input.sector?.trim() ?? null;
    if (input.objective !== undefined)
      updateData.objective = input.objective?.trim() ?? null;
    if (input.tone !== undefined) updateData.tone = input.tone;
    if (colorsStr !== undefined) updateData.colors = colorsStr;
    if (input.driveUrl !== undefined) updateData.driveUrl = input.driveUrl?.trim() || null;

    const updated = await companyRepository.update(companyId, updateData);
    logger.info("[company] Updated", { companyId, userId });
    return updated;
  },

  /**
   * Verifies ownership and deletes a company and all its children atomically.
   *
   * Post-conditions:
   *   - Throws ForbiddenError (opaque 403) if company not found or not owned by userId
   *   - Company and all child records are deleted atomically
   */
  async deleteCompany(userId: string, companyId: string): Promise<void> {
    await this.assertOwnership(userId, companyId);
    await companyRepository.deleteById(companyId);
    logger.info("[company] Deleted", { companyId, userId });
  },

  /**
   * Verifies that the given companyId belongs to userId.
   * Opaque response: throws ForbiddenError (HTTP 403) whether the company
   * does not exist or belongs to a different user — never reveals existence.
   *
   * Post-conditions:
   *   - Returns Company if ownership is valid
   *   - Throws ForbiddenError if company.userId !== userId
   *   - Throws ForbiddenError if companyId does not exist
   */
  async assertOwnership(userId: string, companyId: string): Promise<Company> {
    const company = await companyRepository.findById(companyId);
    if (!company || company.userId !== userId) {
      throw new ForbiddenError("Acesso negado.");
    }
    return company;
  },
};
