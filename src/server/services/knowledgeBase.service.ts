/**
 * knowledgeBase.service.ts
 *
 * Business-logic layer for KnowledgeBase CRUD operations.
 *
 * Responsibilities:
 *   - Validate all field rules before any write
 *   - Assert company ownership via companyService for every mutation
 *   - Delegate persistence to knowledgeBaseRepository
 *   - Surface typed errors (ValidationError, NotFoundError, ForbiddenError)
 *     so REST handlers never have to inspect raw Prisma errors
 */

import type { KnowledgeBase } from "@prisma/client";
import { knowledgeBaseRepository } from "@server/repositories/knowledgeBase.repository";
import { companyService } from "@server/services/company.service";
import { ValidationError, NotFoundError } from "@server/lib/errors";
import { logger } from "@server/lib/logger";

// ─────────────────────────────────────────────
// Public interfaces
// ─────────────────────────────────────────────

export interface CreateKBInput {
  name: string;
  catalogType: string;
  description?: string;
}

export interface UpdateKBInput {
  name?: string;
  description?: string | null;
}

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const MAX_KBS_PER_COMPANY = 10;
const MAX_NAME_LENGTH = 100;
const MAX_CATALOG_TYPE_LENGTH = 50;
const MAX_DESCRIPTION_LENGTH = 500;

// ─────────────────────────────────────────────
// Internal validation helpers
// ─────────────────────────────────────────────

function validateCreateInput(input: CreateKBInput): void {
  // ── name ──────────────────────────────────────────────────────────────────
  const trimmedName = input.name?.trim() ?? "";
  if (trimmedName.length < 1 || trimmedName.length > MAX_NAME_LENGTH) {
    throw new ValidationError(
      `O campo 'name' deve ter entre 1 e ${MAX_NAME_LENGTH} caracteres.`,
    );
  }

  // ── catalogType ───────────────────────────────────────────────────────────
  const trimmedCatalogType = input.catalogType?.trim() ?? "";
  if (trimmedCatalogType.length < 1 || trimmedCatalogType.length > MAX_CATALOG_TYPE_LENGTH) {
    throw new ValidationError(
      `O campo 'catalogType' deve ter entre 1 e ${MAX_CATALOG_TYPE_LENGTH} caracteres.`,
    );
  }

  // ── description (optional) ────────────────────────────────────────────────
  if (input.description !== undefined && input.description !== null) {
    if (input.description.length > MAX_DESCRIPTION_LENGTH) {
      throw new ValidationError(
        `O campo 'description' deve ter no máximo ${MAX_DESCRIPTION_LENGTH} caracteres.`,
      );
    }
  }
}

function validateUpdateInput(input: UpdateKBInput): void {
  // ── name (optional) ───────────────────────────────────────────────────────
  if (input.name !== undefined) {
    const trimmedName = input.name.trim();
    if (trimmedName.length < 1 || trimmedName.length > MAX_NAME_LENGTH) {
      throw new ValidationError(
        `O campo 'name' deve ter entre 1 e ${MAX_NAME_LENGTH} caracteres.`,
      );
    }
  }

  // ── description (optional) ────────────────────────────────────────────────
  if (input.description !== undefined && input.description !== null) {
    if (input.description.length > MAX_DESCRIPTION_LENGTH) {
      throw new ValidationError(
        `O campo 'description' deve ter no máximo ${MAX_DESCRIPTION_LENGTH} caracteres.`,
      );
    }
  }
}

// ─────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────

export const knowledgeBaseService = {
  /**
   * Returns all knowledge bases belonging to `companyId`, ordered by creation
   * date (most recent first).
   *
   * No auth check — caller must ensure the company belongs to the user.
   *
   * Post-conditions:
   *   - Returns array (possibly empty) where ∀ kb: kb.companyId === companyId
   *   - Order is descending by kb.createdAt (enforced by repository)
   */
  async listByCompanyId(companyId: string): Promise<KnowledgeBase[]> {
    return knowledgeBaseRepository.findByCompanyId(companyId);
  },

  /**
   * Retrieves a single knowledge base by its primary key, after asserting that
   * `userId` owns the parent company.
   *
   * Post-conditions:
   *   - Throws NotFoundError("KnowledgeBase") if kbId does not exist
   *   - Throws ForbiddenError if userId does not own the KB's company
   *   - Returns KnowledgeBase on success
   */
  async getById(userId: string, kbId: string): Promise<KnowledgeBase> {
    return this.assertOwnership(userId, kbId);
  },

  /**
   * Creates a new KnowledgeBase for the given company after ownership
   * assertion, field validation and plan-limit check.
   *
   * Post-conditions:
   *   - Throws ForbiddenError if userId does not own companyId
   *   - Throws ValidationError on any invalid field
   *   - Throws ValidationError if company already has 10 KBs (limit reached)
   *   - Returns created KnowledgeBase with a generated cuid id
   *   - kb.companyId === companyId
   */
  async create(
    userId: string,
    companyId: string,
    input: CreateKBInput,
  ): Promise<KnowledgeBase> {
    // 1. Verify ownership
    await companyService.assertOwnership(userId, companyId);

    // 2. Validate input
    validateCreateInput(input);

    // 3. Check company KB limit
    const currentCount = await knowledgeBaseRepository.countByCompanyId(companyId);
    if (currentCount >= MAX_KBS_PER_COMPANY) {
      throw new ValidationError(
        `Limite de ${MAX_KBS_PER_COMPANY} bases de conhecimento por empresa atingido.`,
      );
    }

    // 4. Persist
    const kb = await knowledgeBaseRepository.create({
      companyId,
      name: input.name.trim(),
      catalogType: input.catalogType.trim(),
      description: input.description?.trim() ?? null,
    });

    logger.info("[knowledgeBase.service] KnowledgeBase created", {
      kbId: kb.id,
      companyId,
      userId,
    });

    return kb;
  },

  /**
   * Updates an existing knowledge base after ownership assertion and
   * field validation.
   *
   * Post-conditions:
   *   - Throws NotFoundError("KnowledgeBase") if kbId does not exist
   *   - Throws ForbiddenError if userId does not own the KB's company
   *   - Throws ValidationError on any invalid updated field
   *   - kb.id and kb.companyId are never mutated
   *   - Fields not provided retain their previous values
   */
  async update(
    userId: string,
    kbId: string,
    input: UpdateKBInput,
  ): Promise<KnowledgeBase> {
    // 1. Assert existence and ownership
    await this.assertOwnership(userId, kbId);

    // 2. Validate only the provided fields
    validateUpdateInput(input);

    // 3. Build update payload — only include defined fields
    const data: { name?: string; description?: string | null } = {};

    if (input.name !== undefined) data.name = input.name.trim();
    if (input.description !== undefined) data.description = input.description;

    const updated = await knowledgeBaseRepository.update(kbId, data);

    logger.info("[knowledgeBase.service] KnowledgeBase updated", {
      kbId: updated.id,
      companyId: updated.companyId,
      userId,
    });

    return updated;
  },

  /**
   * Deletes a knowledge base after ownership assertion.
   * Cascade deletion of CatalogFields, CatalogRecords, KBAgents and KBMessages
   * is handled by the database via `onDelete: Cascade`.
   *
   * Post-conditions:
   *   - Throws NotFoundError("KnowledgeBase") if kbId does not exist
   *   - Throws ForbiddenError if userId does not own the KB's company
   *   - KB and all child records are removed atomically by the database
   */
  async delete(userId: string, kbId: string): Promise<void> {
    const existing = await this.assertOwnership(userId, kbId);

    await knowledgeBaseRepository.delete(existing.id);

    logger.info("[knowledgeBase.service] KnowledgeBase deleted", {
      kbId: existing.id,
      companyId: existing.companyId,
      userId,
    });
  },

  /**
   * Verifies that `userId` owns the company that owns the knowledge base
   * identified by `kbId`.
   *
   * Error semantics:
   *   - NotFoundError("KnowledgeBase") if kbId does not exist
   *   - ForbiddenError if the KB's company is not owned by userId
   *
   * Post-conditions:
   *   - Returns KnowledgeBase when ownership is confirmed
   */
  async assertOwnership(userId: string, kbId: string): Promise<KnowledgeBase> {
    const kb = await knowledgeBaseRepository.findById(kbId);
    if (!kb) {
      throw new NotFoundError("KnowledgeBase");
    }

    // Reuse companyService.assertOwnership which throws ForbiddenError
    // (opaque 403) when the company is not found or not owned by this user
    await companyService.assertOwnership(userId, kb.companyId);

    return kb;
  },
};
