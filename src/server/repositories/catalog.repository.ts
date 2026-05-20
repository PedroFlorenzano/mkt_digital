/**
 * catalog.repository.ts
 *
 * Data access layer for CatalogField and CatalogRecord models.
 * Surfaces Prisma P2002 (unique constraint violation) as ConflictError so the
 * service layer never has to inspect raw Prisma error codes.
 */

import { Prisma } from "@prisma/client";
import type { CatalogField, CatalogRecord } from "@prisma/client";
import { prisma } from "@server/lib/prisma";
import { ConflictError } from "@server/lib/errors";

// ─────────────────────────────────────────────
// Input types — CatalogField
// ─────────────────────────────────────────────

export interface CreateFieldInput {
  knowledgeBaseId: string;
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
// Input types — CatalogRecord
// ─────────────────────────────────────────────

export interface CreateRecordInput {
  knowledgeBaseId: string;
  data: string; // JSON serialized
}

export interface PaginatedRecords {
  records: CatalogRecord[];
  total: number;
}

// ─────────────────────────────────────────────
// Helper — wraps Prisma writes to convert P2002 → ConflictError
// ─────────────────────────────────────────────

async function handleUniqueConstraint<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      throw new ConflictError(
        "A field with the same name already exists for this knowledge base.",
      );
    }
    throw err;
  }
}

// ─────────────────────────────────────────────
// Repository
// ─────────────────────────────────────────────

export const catalogRepository = {
  // ─── CatalogField methods ──────────────────────────────────────────────────

  /**
   * Returns all CatalogFields for the given KnowledgeBase,
   * ordered by displayOrder ascending, then name ascending.
   *
   * Post-conditions:
   *   - Returns array (possibly empty) where ∀ f: f.knowledgeBaseId === knowledgeBaseId
   *   - Primary order is f.displayOrder asc; secondary order is f.name asc
   */
  findFieldsByKBId(knowledgeBaseId: string): Promise<CatalogField[]> {
    return prisma.catalogField.findMany({
      where: { knowledgeBaseId },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    });
  },

  /**
   * Creates a new CatalogField for the given KnowledgeBase.
   * Throws ConflictError if the (knowledgeBaseId, name) pair already exists.
   *
   * Post-conditions:
   *   - Returned field has a generated cuid id
   *   - field.knowledgeBaseId === data.knowledgeBaseId
   *   - field.isFilterable defaults to false when not provided
   *   - field.displayOrder defaults to 0 when not provided
   */
  createField(data: CreateFieldInput): Promise<CatalogField> {
    return handleUniqueConstraint(() =>
      prisma.catalogField.create({
        data: {
          knowledgeBaseId: data.knowledgeBaseId,
          name: data.name,
          dataType: data.dataType,
          isFilterable: data.isFilterable ?? false,
          displayOrder: data.displayOrder ?? 0,
        },
      }),
    );
  },

  /**
   * Updates mutable properties of an existing CatalogField.
   * Throws ConflictError if the update would create a duplicate (knowledgeBaseId, name) pair.
   *
   * Post-conditions:
   *   - field.id === id (immutable)
   *   - field.knowledgeBaseId is not altered
   */
  updateField(id: string, data: UpdateFieldInput): Promise<CatalogField> {
    return handleUniqueConstraint(() =>
      prisma.catalogField.update({
        where: { id },
        data,
      }),
    );
  },

  /**
   * Deletes a CatalogField by its primary key.
   *
   * Post-conditions:
   *   - Returns void on success
   *   - Throws Prisma P2025 if the field does not exist
   */
  async deleteField(id: string): Promise<void> {
    await prisma.catalogField.delete({ where: { id } });
  },

  /**
   * Counts the number of CatalogFields for the given KnowledgeBase.
   *
   * Post-conditions:
   *   - Returns a non-negative integer
   */
  countFieldsByKBId(knowledgeBaseId: string): Promise<number> {
    return prisma.catalogField.count({ where: { knowledgeBaseId } });
  },

  // ─── CatalogRecord methods ─────────────────────────────────────────────────

  /**
   * Returns a paginated slice of CatalogRecords for the given KnowledgeBase,
   * ordered by createdAt descending, along with the total count.
   *
   * Post-conditions:
   *   - result.records.length <= pageSize
   *   - result.total is the full count (ignoring pagination)
   *   - Records are ordered by r.createdAt desc
   */
  async findRecordsByKBId(
    knowledgeBaseId: string,
    page: number,
    pageSize: number,
  ): Promise<PaginatedRecords> {
    const [records, total] = await prisma.$transaction([
      prisma.catalogRecord.findMany({
        where: { knowledgeBaseId },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.catalogRecord.count({ where: { knowledgeBaseId } }),
    ]);
    return { records, total };
  },

  /**
   * Returns ALL CatalogRecords for the given KnowledgeBase with no pagination,
   * ordered by createdAt descending. Used for in-memory filtering (SearchTool).
   *
   * Post-conditions:
   *   - Returns array where ∀ r: r.knowledgeBaseId === knowledgeBaseId
   *   - Order is descending by r.createdAt
   */
  findAllRecordsByKBId(knowledgeBaseId: string): Promise<CatalogRecord[]> {
    return prisma.catalogRecord.findMany({
      where: { knowledgeBaseId },
      orderBy: { createdAt: "desc" },
    });
  },

  /**
   * Creates a single CatalogRecord.
   *
   * Post-conditions:
   *   - Returned record has a generated cuid id
   *   - record.knowledgeBaseId === data.knowledgeBaseId
   */
  createRecord(data: CreateRecordInput): Promise<CatalogRecord> {
    return prisma.catalogRecord.create({
      data: {
        knowledgeBaseId: data.knowledgeBaseId,
        data: data.data,
      },
    });
  },

  /**
   * Bulk-inserts multiple CatalogRecords in a single Prisma call.
   * Returns the number of records created.
   *
   * Post-conditions:
   *   - Returns count >= 0
   *   - All items belong to their specified knowledgeBaseId
   */
  async createManyRecords(items: CreateRecordInput[]): Promise<number> {
    const result = await prisma.catalogRecord.createMany({
      data: items.map((item) => ({
        knowledgeBaseId: item.knowledgeBaseId,
        data: item.data,
      })),
    });
    return result.count;
  },

  /**
   * Updates the JSON data string of an existing CatalogRecord.
   *
   * Post-conditions:
   *   - record.id === id (immutable)
   *   - record.data === data (new serialized JSON)
   */
  updateRecord(id: string, data: string): Promise<CatalogRecord> {
    return prisma.catalogRecord.update({
      where: { id },
      data: { data },
    });
  },

  /**
   * Deletes a CatalogRecord by its primary key.
   *
   * Post-conditions:
   *   - Returns void on success
   *   - Throws Prisma P2025 if the record does not exist
   */
  async deleteRecord(id: string): Promise<void> {
    await prisma.catalogRecord.delete({ where: { id } });
  },

  /**
   * Deletes all CatalogRecords belonging to the given KnowledgeBase.
   * Returns the number of records deleted.
   *
   * Post-conditions:
   *   - No CatalogRecords with knowledgeBaseId remain after this call
   *   - Returns count of deleted records (>= 0)
   */
  async deleteAllRecordsByKBId(knowledgeBaseId: string): Promise<number> {
    const result = await prisma.catalogRecord.deleteMany({
      where: { knowledgeBaseId },
    });
    return result.count;
  },

  /**
   * Counts the total number of CatalogRecords for the given KnowledgeBase.
   *
   * Post-conditions:
   *   - Returns a non-negative integer
   */
  countRecordsByKBId(knowledgeBaseId: string): Promise<number> {
    return prisma.catalogRecord.count({ where: { knowledgeBaseId } });
  },

  /**
   * Finds a single CatalogRecord by its primary key.
   *
   * Post-conditions:
   *   - Returns CatalogRecord if found, null otherwise
   *   - Does not throw for non-existent IDs
   */
  findRecordById(id: string): Promise<CatalogRecord | null> {
    return prisma.catalogRecord.findUnique({ where: { id } });
  },

  /**
   * Removes a specific field key from the JSON data of every CatalogRecord in
   * the given KnowledgeBase. All updates are wrapped in a single transaction to
   * guarantee atomicity.
   *
   * This is called when a CatalogField is deleted so that existing records no
   * longer carry stale data for the removed field.
   *
   * Post-conditions:
   *   - No record in the KnowledgeBase retains a key equal to fieldName
   *   - All other keys and values in each record are unchanged
   *   - Operation is atomic: either all records are updated or none
   */
  async removeFieldFromAllRecords(
    knowledgeBaseId: string,
    fieldName: string,
  ): Promise<void> {
    const records = await prisma.catalogRecord.findMany({
      where: { knowledgeBaseId },
      select: { id: true, data: true },
    });

    await prisma.$transaction(
      records.map((record) => {
        const parsed: Record<string, unknown> = JSON.parse(record.data);
        delete parsed[fieldName];
        return prisma.catalogRecord.update({
          where: { id: record.id },
          data: { data: JSON.stringify(parsed) },
        });
      }),
    );
  },
};
