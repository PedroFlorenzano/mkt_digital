/**
 * catalogField.service.ts
 *
 * Business-logic layer for CatalogField CRUD operations.
 *
 * Responsibilities:
 *   - Validate all field rules before any write
 *   - Assert KB ownership via companyService for every mutation
 *   - Enforce limits: max 50 fields per KnowledgeBase, name uniqueness
 *   - Delegate persistence to catalogRepository
 *   - On field deletion, remove the field key from all existing CatalogRecords
 *   - Surface typed errors (ValidationError, NotFoundError, ForbiddenError,
 *     ConflictError) so REST handlers never have to inspect raw Prisma errors
 *
 * Requirements: 2.2, 2.3, 2.5, 2.6, 2.9, 9.1, 9.2
 */

import type { CatalogField } from "@prisma/client";
import { catalogRepository } from "@server/repositories/catalog.repository";
import { knowledgeBaseRepository } from "@server/repositories/knowledgeBase.repository";
import { companyService } from "@server/services/company.service";
import { ValidationError, NotFoundError } from "@server/lib/errors";
import { logger } from "@server/lib/logger";

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const MAX_FIELDS_PER_KB = 50;
const NAME_REGEX = /^[a-zA-Z0-9_]+$/;
const VALID_DATA_TYPES = ["string", "number", "boolean", "date", "text"] as const;

// ─────────────────────────────────────────────
// Public interfaces
// ─────────────────────────────────────────────

export interface CreateFieldInput {
  name: string;
  dataType: string;
  isFilterable?: boolean;
  displayOrder?: number;
}

export interface UpdateFieldInput {
  name?: string;
  dataType?: string;
  isFilterable?: boolean;
  displayOrder?: number;
}

// ─────────────────────────────────────────────
// Internal validation helpers
// ─────────────────────────────────────────────

/**
 * Validates the `name` field: 1–50 chars, alphanumeric + underscores only.
 * Throws ValidationError on failure.
 */
function validateName(name: string): void {
  if (name.length < 1 || name.length > 50) {
    throw new ValidationError(
      "O campo 'name' deve ter entre 1 e 50 caracteres.",
    );
  }
  if (!NAME_REGEX.test(name)) {
    throw new ValidationError(
      "O campo 'name' deve conter apenas letras, números e underscores.",
    );
  }
}

/**
 * Validates the `dataType` field against the allowed set.
 * Throws ValidationError on failure.
 */
function validateDataType(dataType: string): void {
  if (!(VALID_DATA_TYPES as readonly string[]).includes(dataType)) {
    throw new ValidationError(
      `O campo 'dataType' deve ser um dos seguintes valores: ${VALID_DATA_TYPES.join(", ")}.`,
    );
  }
}

// ─────────────────────────────────────────────
// Internal ownership helper
// ─────────────────────────────────────────────

/**
 * Fetches the KnowledgeBase by id and asserts that userId owns its company.
 * Throws NotFoundError("KnowledgeBase") if the KB does not exist.
 * Throws ForbiddenError if userId does not own the KB's company.
 *
 * Post-conditions:
 *   - Returns KnowledgeBase when ownership is confirmed
 */
async function assertKBOwnership(userId: string, knowledgeBaseId: string) {
  const kb = await knowledgeBaseRepository.findById(knowledgeBaseId);
  if (!kb) {
    throw new NotFoundError("KnowledgeBase");
  }
  await companyService.assertOwnership(userId, kb.companyId);
  return kb;
}

// ─────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────

export const catalogFieldService = {
  /**
   * Returns all CatalogFields for the given KnowledgeBase, ordered by
   * displayOrder asc then name asc.
   *
   * Post-conditions:
   *   - Throws NotFoundError("KnowledgeBase") if knowledgeBaseId does not exist
   *   - Throws ForbiddenError if userId does not own the KB's company
   *   - Returns array (possibly empty) of fields belonging to knowledgeBaseId
   */
  async listByKBId(
    userId: string,
    knowledgeBaseId: string,
  ): Promise<CatalogField[]> {
    await assertKBOwnership(userId, knowledgeBaseId);
    return catalogRepository.findFieldsByKBId(knowledgeBaseId);
  },

  /**
   * Creates a new CatalogField for the given KnowledgeBase after ownership
   * assertion, input validation and field count enforcement.
   *
   * Post-conditions:
   *   - Throws NotFoundError("KnowledgeBase") if knowledgeBaseId does not exist
   *   - Throws ForbiddenError if userId does not own the KB's company
   *   - Throws ValidationError if name is invalid (length or characters)
   *   - Throws ValidationError if dataType is not one of the allowed values
   *   - Throws ValidationError if the KB already has 50 fields
   *   - Throws ConflictError if the name already exists within the KB
   *   - Returned field has field.knowledgeBaseId === knowledgeBaseId
   */
  async create(
    userId: string,
    knowledgeBaseId: string,
    input: CreateFieldInput,
  ): Promise<CatalogField> {
    // 1. Assert KB existence and ownership
    await assertKBOwnership(userId, knowledgeBaseId);

    // 2. Validate required fields
    validateName(input.name);
    validateDataType(input.dataType);

    // 3. Enforce field count limit
    const fieldCount = await catalogRepository.countFieldsByKBId(knowledgeBaseId);
    if (fieldCount >= MAX_FIELDS_PER_KB) {
      throw new ValidationError(
        `A base de conhecimento já atingiu o limite máximo de ${MAX_FIELDS_PER_KB} campos.`,
      );
    }

    // 4. Persist
    const field = await catalogRepository.createField({
      knowledgeBaseId,
      name: input.name,
      dataType: input.dataType,
      isFilterable: input.isFilterable,
      displayOrder: input.displayOrder,
    });

    logger.info("[catalogField.service] Field created", {
      fieldId: field.id,
      knowledgeBaseId,
      userId,
    });

    return field;
  },

  /**
   * Updates an existing CatalogField after ownership assertion and validation.
   *
   * Post-conditions:
   *   - Throws NotFoundError("CatalogField") if fieldId does not exist
   *   - Throws ForbiddenError if userId does not own the field's KB company
   *   - Throws ValidationError if the provided name is invalid
   *   - Throws ValidationError if the provided dataType is invalid
   *   - Throws ConflictError if the updated name collides with another field in the KB
   *   - field.id and field.knowledgeBaseId are never mutated
   */
  async update(
    userId: string,
    fieldId: string,
    input: UpdateFieldInput,
  ): Promise<CatalogField> {
    // 1. Lookup field to get its knowledgeBaseId
    const field = await this._findFieldById(fieldId);

    // 2. Assert KB ownership
    await assertKBOwnership(userId, field.knowledgeBaseId);

    // 3. Validate only the fields that are being updated
    if (input.name !== undefined) {
      validateName(input.name);
    }
    if (input.dataType !== undefined) {
      validateDataType(input.dataType);
    }

    // 4. Build update payload — only include defined fields
    const data: UpdateFieldInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.dataType !== undefined) data.dataType = input.dataType;
    if (input.isFilterable !== undefined) data.isFilterable = input.isFilterable;
    if (input.displayOrder !== undefined) data.displayOrder = input.displayOrder;

    const updated = await catalogRepository.updateField(field.id, data);

    logger.info("[catalogField.service] Field updated", {
      fieldId: updated.id,
      knowledgeBaseId: updated.knowledgeBaseId,
      userId,
    });

    return updated;
  },

  /**
   * Deletes a CatalogField and removes its key from all existing CatalogRecords.
   *
   * Post-conditions:
   *   - Throws NotFoundError("CatalogField") if fieldId does not exist
   *   - Throws ForbiddenError if userId does not own the field's KB company
   *   - All CatalogRecords in the KB no longer carry the deleted field's key
   *   - removeFieldFromAllRecords is called BEFORE deleteField to preserve atomicity
   */
  async delete(userId: string, fieldId: string): Promise<void> {
    // 1. Lookup field to get its knowledgeBaseId and name
    const field = await this._findFieldById(fieldId);

    // 2. Assert KB ownership
    await assertKBOwnership(userId, field.knowledgeBaseId);

    // 3. Remove field key from all existing records BEFORE deleting the field
    await catalogRepository.removeFieldFromAllRecords(
      field.knowledgeBaseId,
      field.name,
    );

    // 4. Delete the field
    await catalogRepository.deleteField(field.id);

    logger.info("[catalogField.service] Field deleted", {
      fieldId: field.id,
      fieldName: field.name,
      knowledgeBaseId: field.knowledgeBaseId,
      userId,
    });
  },

  /**
   * Internal helper: fetches a single CatalogField by its primary key.
   * Throws NotFoundError("CatalogField") if not found.
   *
   * This is an internal method — not intended for external callers.
   */
  async _findFieldById(fieldId: string): Promise<CatalogField> {
    const { prisma } = await import("@server/lib/prisma");
    const field = await prisma.catalogField.findUnique({ where: { id: fieldId } });
    if (!field) {
      throw new NotFoundError("CatalogField");
    }
    return field;
  },
};
