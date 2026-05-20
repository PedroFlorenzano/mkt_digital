/**
 * catalogRecord.service.ts
 *
 * Business-logic layer for CatalogRecord CRUD operations.
 *
 * Responsibilities:
 *   - Assert company ownership via knowledgeBaseService for every operation
 *   - Validate record data field values against their declared CatalogField types
 *   - Enforce the 50,000 record limit per KnowledgeBase
 *   - Delegate persistence to catalogRepository
 *   - Surface typed errors (ValidationError, NotFoundError, ForbiddenError)
 *     so REST handlers never have to inspect raw Prisma errors
 */

import type { CatalogRecord } from "@prisma/client";
import { catalogRepository } from "@server/repositories/catalog.repository";
import { knowledgeBaseRepository } from "@server/repositories/knowledgeBase.repository";
import { companyService } from "@server/services/company.service";
import { ValidationError, NotFoundError } from "@server/lib/errors";
import { logger } from "@server/lib/logger";

// ─────────────────────────────────────────────
// Public interfaces
// ─────────────────────────────────────────────

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const MAX_RECORDS_PER_KB = 50_000;

/** Matches YYYY-MM-DD strictly (no time component) */
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// ─────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────

/**
 * Validates all fields present in `data` against the declared CatalogField
 * definitions fetched for the given `knowledgeBaseId`.
 *
 * Only fields that are declared as CatalogFields are validated; extra keys in
 * `data` that have no matching field are silently accepted (the service stores
 * whatever the caller provides — format validation is the concern here).
 *
 * Throws ValidationError on the first invalid value found.
 */
async function validateRecordData(
  knowledgeBaseId: string,
  data: Record<string, unknown>,
): Promise<void> {
  const fields = await catalogRepository.findFieldsByKBId(knowledgeBaseId);
  const fieldMap = new Map(fields.map((f) => [f.name, f.dataType]));

  for (const [key, value] of Object.entries(data)) {
    const dataType = fieldMap.get(key);
    if (!dataType) continue; // unknown fields are not validated

    if (value === null || value === undefined) continue; // nulls are allowed

    switch (dataType) {
      case "number": {
        const numValue = typeof value === "string" ? value : String(value);
        const parsed = parseFloat(numValue);
        if (isNaN(parsed)) {
          throw new ValidationError(
            `O campo '${key}' deve ser um número decimal válido (ex: 123.45).`,
          );
        }
        break;
      }
      case "date": {
        const strValue = typeof value === "string" ? value : String(value);
        if (!DATE_REGEX.test(strValue)) {
          throw new ValidationError(
            `O campo '${key}' deve estar no formato YYYY-MM-DD (ex: 2025-07-01).`,
          );
        }
        break;
      }
      // string, boolean, text: no strict format validation at the service layer
    }
  }
}

// ─────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────

export const catalogRecordService = {
  /**
   * Returns a paginated list of CatalogRecords for the given KnowledgeBase.
   *
   * Post-conditions:
   *   - Throws NotFoundError("KnowledgeBase") if knowledgeBaseId does not exist
   *   - Throws ForbiddenError if userId does not own the KB's company
   *   - Returns PaginatedResult with items ordered by createdAt desc
   */
  async list(
    userId: string,
    knowledgeBaseId: string,
    page: number,
    pageSize: number,
  ): Promise<PaginatedResult<CatalogRecord>> {
    // Assert ownership
    await assertKBOwnership(userId, knowledgeBaseId);

    const { records, total } = await catalogRepository.findRecordsByKBId(
      knowledgeBaseId,
      page,
      pageSize,
    );

    return { items: records, total, page, pageSize };
  },

  /**
   * Creates a new CatalogRecord after ownership assertion, field validation
   * and limit check.
   *
   * Post-conditions:
   *   - Throws ForbiddenError if userId does not own the KB's company
   *   - Throws ValidationError if any field value has an invalid format
   *   - Throws ValidationError if the KB already has 50,000 records
   *   - Returns the created CatalogRecord
   *   - record.knowledgeBaseId === knowledgeBaseId
   */
  async create(
    userId: string,
    knowledgeBaseId: string,
    data: Record<string, unknown>,
  ): Promise<CatalogRecord> {
    // 1. Assert ownership
    await assertKBOwnership(userId, knowledgeBaseId);

    // 2. Validate field formats
    await validateRecordData(knowledgeBaseId, data);

    // 3. Enforce record limit
    const currentCount = await catalogRepository.countRecordsByKBId(knowledgeBaseId);
    if (currentCount >= MAX_RECORDS_PER_KB) {
      throw new ValidationError(
        `Limite de ${MAX_RECORDS_PER_KB.toLocaleString()} registros por base de conhecimento atingido.`,
      );
    }

    // 4. Persist
    const record = await catalogRepository.createRecord({
      knowledgeBaseId,
      data: JSON.stringify(data),
    });

    logger.info("[catalogRecord.service] Record created", {
      recordId: record.id,
      knowledgeBaseId,
      userId,
    });

    return record;
  },

  /**
   * Updates an existing CatalogRecord after ownership assertion and field
   * validation.
   *
   * Post-conditions:
   *   - Throws NotFoundError("CatalogRecord") if recordId does not exist
   *   - Throws ForbiddenError if userId does not own the KB's company
   *   - Throws ValidationError if any field value has an invalid format
   *   - record.id and record.knowledgeBaseId are never mutated
   */
  async update(
    userId: string,
    recordId: string,
    data: Record<string, unknown>,
  ): Promise<CatalogRecord> {
    // 1. Look up record and assert ownership
    const existing = await assertRecordOwnership(userId, recordId);

    // 2. Validate field formats against the KB's fields
    await validateRecordData(existing.knowledgeBaseId, data);

    // 3. Persist
    const updated = await catalogRepository.updateRecord(
      existing.id,
      JSON.stringify(data),
    );

    logger.info("[catalogRecord.service] Record updated", {
      recordId: updated.id,
      knowledgeBaseId: updated.knowledgeBaseId,
      userId,
    });

    return updated;
  },

  /**
   * Deletes a CatalogRecord after ownership assertion.
   *
   * Post-conditions:
   *   - Throws NotFoundError("CatalogRecord") if recordId does not exist
   *   - Throws ForbiddenError if userId does not own the KB's company
   *   - Record is permanently removed
   */
  async delete(userId: string, recordId: string): Promise<void> {
    const existing = await assertRecordOwnership(userId, recordId);

    await catalogRepository.deleteRecord(existing.id);

    logger.info("[catalogRecord.service] Record deleted", {
      recordId: existing.id,
      knowledgeBaseId: existing.knowledgeBaseId,
      userId,
    });
  },

  /**
   * Deletes ALL CatalogRecords of a KnowledgeBase after ownership assertion.
   * CatalogFields are NOT affected.
   *
   * Post-conditions:
   *   - Throws NotFoundError("KnowledgeBase") if knowledgeBaseId does not exist
   *   - Throws ForbiddenError if userId does not own the KB's company
   *   - Returns the number of records deleted (>= 0)
   *   - No CatalogFields are removed
   */
  async deleteAll(userId: string, knowledgeBaseId: string): Promise<number> {
    // Assert ownership
    await assertKBOwnership(userId, knowledgeBaseId);

    const count = await catalogRepository.deleteAllRecordsByKBId(knowledgeBaseId);

    logger.info("[catalogRecord.service] All records deleted", {
      knowledgeBaseId,
      deletedCount: count,
      userId,
    });

    return count;
  },
};

// ─────────────────────────────────────────────
// Private ownership helpers
// ─────────────────────────────────────────────

/**
 * Asserts that the KnowledgeBase exists and is owned by userId's company.
 * Throws NotFoundError or ForbiddenError accordingly.
 */
async function assertKBOwnership(
  userId: string,
  knowledgeBaseId: string,
): Promise<void> {
  const kb = await knowledgeBaseRepository.findById(knowledgeBaseId);
  if (!kb) {
    throw new NotFoundError("KnowledgeBase");
  }
  await companyService.assertOwnership(userId, kb.companyId);
}

/**
 * Asserts that the CatalogRecord exists and its parent KnowledgeBase is owned
 * by userId's company.
 *
 * Throws NotFoundError("CatalogRecord") if not found.
 * Throws ForbiddenError if ownership check fails.
 *
 * Returns the found CatalogRecord on success.
 */
async function assertRecordOwnership(
  userId: string,
  recordId: string,
): Promise<CatalogRecord> {
  const record = await catalogRepository.findRecordById(recordId);
  if (!record) {
    throw new NotFoundError("CatalogRecord");
  }

  await assertKBOwnership(userId, record.knowledgeBaseId);

  return record;
}
