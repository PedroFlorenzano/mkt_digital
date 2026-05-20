/**
 * searchTool.service.ts
 *
 * Implements the SearchTool used by the KBAgent's AI to query the knowledge base
 * with structured filters. Filtering is performed in-memory (JavaScript) over all
 * CatalogRecords of the given KnowledgeBase.
 *
 * Filter semantics:
 *   - string  : case-insensitive partial match (includes)
 *   - number  : eq, gte, lte, between (inclusive)
 *   - boolean : exact match
 *   - date    : eq, gte, lte with YYYY-MM-DD strings (lexicographic comparison)
 *
 * Fields that don't exist in the KnowledgeBase or have isFilterable=false are ignored.
 * When no valid filters remain, returns the 10 most recent records (createdAt desc).
 * Otherwise, returns at most 10 records that satisfy ALL filters, sorted by number
 * of satisfied filters descending (which equals total valid filters for matched records,
 * since only records satisfying all filters are returned).
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9
 */

import type { CatalogRecord } from "@prisma/client";
import { catalogRepository } from "@server/repositories/catalog.repository";

// ─────────────────────────────────────────────
// Filter type definitions
// ─────────────────────────────────────────────

export interface NumberFilter {
  eq?: number;
  gte?: number;
  lte?: number;
  between?: { min: number; max: number };
}

export interface DateFilter {
  eq?: string; // YYYY-MM-DD
  gte?: string;
  lte?: string;
}

export type FilterValue = string | boolean | NumberFilter | DateFilter;

export interface SearchFilters {
  [fieldName: string]: FilterValue;
}

// ─────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────

/**
 * Returns true if `value` matches the string filter (case-insensitive partial match).
 */
function matchesStringFilter(value: unknown, filter: string): boolean {
  if (value === null || value === undefined) return false;
  return String(value).toLowerCase().includes(filter.toLowerCase());
}

/**
 * Returns true if `value` matches the number filter.
 */
function matchesNumberFilter(value: unknown, filter: NumberFilter): boolean {
  if (value === null || value === undefined) return false;
  const num = Number(value);
  if (isNaN(num)) return false;

  if (filter.eq !== undefined && num !== filter.eq) return false;
  if (filter.gte !== undefined && num < filter.gte) return false;
  if (filter.lte !== undefined && num > filter.lte) return false;
  if (filter.between !== undefined) {
    if (num < filter.between.min || num > filter.between.max) return false;
  }
  return true;
}

/**
 * Returns true if `value` matches the boolean filter (exact match).
 */
function matchesBooleanFilter(value: unknown, filter: boolean): boolean {
  if (value === null || value === undefined) return false;
  return value === filter;
}

/**
 * Returns true if `value` matches the date filter (YYYY-MM-DD lexicographic comparison).
 */
function matchesDateFilter(value: unknown, filter: DateFilter): boolean {
  if (value === null || value === undefined) return false;
  const dateStr = String(value);

  if (filter.eq !== undefined && dateStr !== filter.eq) return false;
  if (filter.gte !== undefined && dateStr < filter.gte) return false;
  if (filter.lte !== undefined && dateStr > filter.lte) return false;
  return true;
}

/**
 * Returns true if a record's field value satisfies the given filter for the given dataType.
 * Returns false if the value is null/undefined.
 */
function fieldSatisfiesFilter(
  recordValue: unknown,
  dataType: string,
  filter: FilterValue,
): boolean {
  if (recordValue === null || recordValue === undefined) return false;

  switch (dataType) {
    case "string":
    case "text":
      if (typeof filter === "string") {
        return matchesStringFilter(recordValue, filter);
      }
      return false;

    case "number":
      if (typeof filter === "object" && filter !== null && !Array.isArray(filter)) {
        return matchesNumberFilter(recordValue, filter as NumberFilter);
      }
      return false;

    case "boolean":
      if (typeof filter === "boolean") {
        return matchesBooleanFilter(recordValue, filter);
      }
      return false;

    case "date":
      if (typeof filter === "object" && filter !== null && !Array.isArray(filter)) {
        return matchesDateFilter(recordValue, filter as DateFilter);
      }
      return false;

    default:
      return false;
  }
}

// ─────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────

export const searchToolService = {
  /**
   * Searches CatalogRecords for the given KnowledgeBase using the provided filters.
   *
   * Steps:
   * 1. Load all records (ordered by createdAt desc) and all fields.
   * 2. Build a map of fieldName → { dataType, isFilterable }.
   * 3. Filter the `filters` object: keep only entries whose fieldName exists as a
   *    CatalogField with isFilterable=true.
   * 4. If no valid filters remain: return the first 10 records (already sorted desc).
   * 5. Otherwise: for each record, count how many valid filters it satisfies.
   *    Exclude records that don't satisfy ALL filters.
   *    Sort remaining records by satisfied filter count (desc) and return at most 10.
   *
   * Requirements: 7.1–7.9
   */
  async search(
    knowledgeBaseId: string,
    filters: SearchFilters,
  ): Promise<CatalogRecord[]> {
    // Load records (createdAt desc) and fields in parallel
    const [records, fields] = await Promise.all([
      catalogRepository.findAllRecordsByKBId(knowledgeBaseId),
      catalogRepository.findFieldsByKBId(knowledgeBaseId),
    ]);

    // Build field map: fieldName → { dataType, isFilterable }
    const fieldMap = new Map<string, { dataType: string; isFilterable: boolean }>();
    for (const field of fields) {
      fieldMap.set(field.name, {
        dataType: field.dataType,
        isFilterable: field.isFilterable,
      });
    }

    // Resolve valid filters: must exist as CatalogField with isFilterable=true
    const validFilterEntries = Object.entries(filters).filter(([fieldName]) => {
      const fieldMeta = fieldMap.get(fieldName);
      return fieldMeta !== undefined && fieldMeta.isFilterable;
    });

    // If no valid filters, return the 10 most recent records (already sorted desc)
    if (validFilterEntries.length === 0) {
      return records.slice(0, 10);
    }

    const totalFilters = validFilterEntries.length;

    // Score each record
    const scored: { record: CatalogRecord; satisfiedCount: number }[] = [];

    for (const record of records) {
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(record.data) as Record<string, unknown>;
      } catch {
        // Malformed JSON — record cannot satisfy any filter
        continue;
      }

      let satisfiedCount = 0;
      let allSatisfied = true;

      for (const [fieldName, filterValue] of validFilterEntries) {
        const fieldMeta = fieldMap.get(fieldName)!;
        const recordValue = data[fieldName];

        if (fieldSatisfiesFilter(recordValue, fieldMeta.dataType, filterValue)) {
          satisfiedCount++;
        } else {
          allSatisfied = false;
          break; // AND semantics: stop early if any filter fails
        }
      }

      if (allSatisfied && satisfiedCount === totalFilters) {
        scored.push({ record, satisfiedCount });
      }
    }

    // Sort by satisfiedCount descending (all equal to totalFilters, but kept for
    // clarity and future extensibility) and return at most 10
    scored.sort((a, b) => b.satisfiedCount - a.satisfiedCount);

    return scored.slice(0, 10).map((s) => s.record);
  },
};
