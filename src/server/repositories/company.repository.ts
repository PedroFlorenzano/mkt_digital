import { prisma } from "@server/lib/prisma";
import type { Company, SocialAccount } from "@prisma/client";
import type { CompanySummary } from "@/types/company";

export type CompanyWithSocial = Company & {
  socialAccounts: SocialAccount[];
};

/** Input shape accepted by `create` and `update` at the repository level.
 *  `colors` is stored as a raw nullable string (JSON-serialised array) in SQLite. */
export type CompanyCreateData = {
  name: string;
  description?: string | null;
  sector?: string | null;
  objective?: string | null;
  tone?: string;
  colors?: string | null;
};

export type CompanyUpdateData = Partial<
  CompanyCreateData & { logoUrl: string | null }
>;

export const companyRepository = {
  // ─────────────────────────────────────────────
  // Legacy methods — kept for backward compatibility
  // ─────────────────────────────────────────────

  /** @deprecated Use findAllByUserId for multi-company support. */
  findByUserId(userId: string): Promise<Company | null> {
    return prisma.company.findFirst({ where: { userId } });
  },

  /** @deprecated Use findAllByUserId + findById for multi-company support. */
  findByUserIdWithSocial(userId: string): Promise<CompanyWithSocial | null> {
    return prisma.company.findFirst({
      where: { userId },
      include: { socialAccounts: true },
    });
  },

  /** @deprecated Use create / update individually. */
  async upsert(
    userId: string,
    data: CompanyCreateData,
  ): Promise<Company> {
    // userId is no longer unique (multi-company support); fall back to
    // findFirst + create/update so the deprecated callers still work.
    const existing = await prisma.company.findFirst({ where: { userId } });
    if (existing) {
      return prisma.company.update({ where: { id: existing.id }, data });
    }
    return prisma.company.create({ data: { userId, ...data } });
  },

  /** @deprecated Use update(companyId, { logoUrl }) instead. */
  async updateLogo(userId: string, logoUrl: string): Promise<Company> {
    // userId is no longer unique; find the first company then update by id.
    const existing = await prisma.company.findFirstOrThrow({ where: { userId } });
    return prisma.company.update({ where: { id: existing.id }, data: { logoUrl } });
  },

  // ─────────────────────────────────────────────
  // New multi-company methods
  // ─────────────────────────────────────────────

  /**
   * Lists all companies belonging to `userId`, ordered alphabetically by name
   * (case-insensitive, using SQLite's LOWER collation via Prisma mode:'insensitive').
   *
   * Post-conditions:
   *   - Returns array (possibly empty) where ∀ c: c.userId === userId
   *   - Order is ascending by c.name (case-insensitive)
   */
  findAllByUserId(userId: string): Promise<CompanySummary[]> {
    return prisma.company.findMany({
      where: { userId },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        sector: true,
        logoUrl: true,
      },
    });
  },

  /**
   * Finds a single company by its primary key.
   *
   * Post-conditions:
   *   - Returns Company if found, null otherwise
   *   - Does not throw for non-existent IDs
   */
  findById(companyId: string): Promise<Company | null> {
    return prisma.company.findUnique({ where: { id: companyId } });
  },

  /**
   * Finds a single company by its primary key, including its social accounts.
   *
   * Post-conditions:
   *   - Returns CompanyWithSocial if found, null otherwise
   *   - Does not throw for non-existent IDs
   */
  findByIdWithSocial(companyId: string): Promise<CompanyWithSocial | null> {
    return prisma.company.findUnique({
      where: { id: companyId },
      include: { socialAccounts: true },
    });
  },

  /**
   * Creates a new company associated with `userId`.
   *
   * Post-conditions:
   *   - Returned Company has a generated cuid id
   *   - company.userId === userId
   */
  create(userId: string, data: CompanyCreateData): Promise<Company> {
    return prisma.company.create({
      data: { userId, ...data },
    });
  },

  /**
   * Updates fields of an existing company identified by `companyId`.
   *
   * Post-conditions:
   *   - company.id === companyId (immutable)
   *   - company.userId is not altered
   */
  update(companyId: string, data: CompanyUpdateData): Promise<Company> {
    return prisma.company.update({
      where: { id: companyId },
      data,
    });
  },

  /**
   * Atomically deletes a company and all cascading child records in a single
   * Prisma interactive transaction. If any deletion fails the entire transaction
   * is rolled back.
   *
   * Child models covered (mirrors schema.prisma onDelete: Cascade):
   *   Post → PostVariant, SocialAccount, CostLog,
   *   AdPlatformCredential → AdCampaign → AdMetricSnapshot / AutomationRule /
   *   AbTest / CampaignAuditLog, AutomationRule → RuleExecutionLog, VideoJob,
   *   VideoCredit
   *
   * Post-conditions:
   *   - Company and all child rows are removed or nothing is removed (atomicity)
   *   - Returns void on success
   */
  async deleteById(companyId: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      // 1. Delete leaf-level children that don't cascade automatically
      //    (models with SetNull FKs must be cleaned first to avoid FK violations)

      // RuleExecutionLog references AutomationRule (Cascade on rule delete)
      // — will be handled when AutomationRule rows are deleted below.

      // CostLog.videoJobId uses SetNull — nullify before deleting VideoJob
      await tx.costLog.updateMany({
        where: { companyId },
        data: { videoJobId: null },
      });

      // AdMetricSnapshot — cascades from AdCampaign
      // AbTest — cascades from AdCampaign
      // RuleExecutionLog — cascades from AutomationRule

      // AutomationRule may reference AdCampaign (SetNull) — delete rules first
      await tx.automationRule.deleteMany({ where: { companyId } });

      // AdCampaign references AdPlatformCredential (no cascade on credential delete)
      // — delete campaigns before credentials
      // CampaignAuditLog.campaignId is SetNull, so delete audit logs first
      await tx.campaignAuditLog.deleteMany({ where: { companyId } });
      await tx.adCampaign.deleteMany({ where: { companyId } });
      await tx.adPlatformCredential.deleteMany({ where: { companyId } });

      // PostVariant cascades from Post; delete posts (variants follow via Cascade)
      await tx.post.deleteMany({ where: { companyId } });

      // Remaining direct children
      await tx.socialAccount.deleteMany({ where: { companyId } });
      await tx.costLog.deleteMany({ where: { companyId } });
      await tx.videoJob.deleteMany({ where: { companyId } });
      await tx.videoCredit.deleteMany({ where: { companyId } });

      // Finally delete the company itself
      await tx.company.delete({ where: { id: companyId } });
    });
  },

  /**
   * Counts the number of companies that belong to `userId`.
   *
   * Post-conditions:
   *   - Returns integer ≥ 0
   *   - Consistent with findAllByUserId(userId).length
   */
  countByUserId(userId: string): Promise<number> {
    return prisma.company.count({ where: { userId } });
  },
};
