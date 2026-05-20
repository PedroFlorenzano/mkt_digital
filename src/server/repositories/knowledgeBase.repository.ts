/**
 * knowledgeBase.repository.ts
 *
 * Data access layer for the KnowledgeBase model.
 * Follows the same pattern as agent.repository.ts.
 */

import type { KnowledgeBase } from "@prisma/client";
import { prisma } from "@server/lib/prisma";

// ─────────────────────────────────────────────
// Input types
// ─────────────────────────────────────────────

export interface CreateKBInput {
  companyId: string;
  name: string;
  description?: string | null;
  catalogType: string;
}

export interface UpdateKBInput {
  name?: string;
  description?: string | null;
}

// ─────────────────────────────────────────────
// Repository
// ─────────────────────────────────────────────

export const knowledgeBaseRepository = {
  /**
   * Returns all knowledge bases belonging to `companyId`, ordered by creation
   * date (most recent first).
   *
   * Post-conditions:
   *   - Returns array (possibly empty) where ∀ kb: kb.companyId === companyId
   *   - Order is descending by kb.createdAt
   */
  findByCompanyId(companyId: string): Promise<KnowledgeBase[]> {
    return prisma.knowledgeBase.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
    });
  },

  /**
   * Finds a single knowledge base by its primary key.
   *
   * Post-conditions:
   *   - Returns KnowledgeBase if found, null otherwise
   *   - Does not throw for non-existent IDs
   */
  findById(id: string): Promise<KnowledgeBase | null> {
    return prisma.knowledgeBase.findUnique({ where: { id } });
  },

  /**
   * Creates a new KnowledgeBase record.
   *
   * Post-conditions:
   *   - Returned KB has a generated cuid id
   *   - kb.companyId === data.companyId
   *   - kb.catalogType === data.catalogType
   */
  create(data: CreateKBInput): Promise<KnowledgeBase> {
    return prisma.knowledgeBase.create({
      data: {
        companyId: data.companyId,
        name: data.name,
        description: data.description ?? null,
        catalogType: data.catalogType,
      },
    });
  },

  /**
   * Updates the name and/or description of an existing knowledge base.
   *
   * Post-conditions:
   *   - kb.id === id (immutable)
   *   - kb.companyId is not altered
   *   - kb.catalogType is not altered
   */
  update(id: string, data: UpdateKBInput): Promise<KnowledgeBase> {
    return prisma.knowledgeBase.update({
      where: { id },
      data,
    });
  },

  /**
   * Deletes the knowledge base and all associated records (cascade is
   * handled by the database via `onDelete: Cascade` in the schema).
   *
   * Post-conditions:
   *   - Returns void on success
   *   - Throws Prisma P2025 (record not found) if the KB does not exist —
   *     callers should handle this or use findById first.
   */
  async delete(id: string): Promise<void> {
    await prisma.knowledgeBase.delete({ where: { id } });
  },

  /**
   * Returns the total number of knowledge bases belonging to `companyId`.
   *
   * Post-conditions:
   *   - Returns a non-negative integer
   */
  countByCompanyId(companyId: string): Promise<number> {
    return prisma.knowledgeBase.count({ where: { companyId } });
  },
};
