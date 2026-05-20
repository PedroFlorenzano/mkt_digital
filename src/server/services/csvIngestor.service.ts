/**
 * csvIngestor.service.ts
 *
 * Processes a CSV buffer and creates CatalogRecords for each valid data row.
 *
 * Responsibilities:
 *   - Validate file size (≤ 10 MB) and line count (≤ 10.000 data lines)
 *   - Validate that the upload won't exceed the 50.000 records per KB limit
 *   - Parse headers (first non-empty line) with RFC 4180 basic rules
 *   - Match CSV columns to CatalogFields by case-sensitive name; ignore unrecognized columns
 *   - Validate per-row field values (number, date types); collect errors without aborting
 *   - Bulk-insert valid rows via catalogRepository.createManyRecords
 *   - Return IngestResult: { created, errors, errorDetails }
 *
 * Requirements: 3.1, 3.2, 3.3, 3.9
 */

import { catalogRepository } from "@server/repositories/catalog.repository";
import { ValidationError } from "@server/lib/errors";

// ─────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────

export interface RowError {
  /** 1-based row number in the data section (row 1 = first data row after header) */
  row: number;
  field: string;
  message: string;
}

export interface IngestResult {
  created: number;
  errors: number;
  errorDetails: RowError[];
}

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_DATA_LINES = 10_000;
const MAX_RECORDS_PER_KB = 50_000;

/** Matches YYYY-MM-DD strictly */
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// ─────────────────────────────────────────────
// RFC 4180 CSV parser (basic)
// ─────────────────────────────────────────────

/**
 * Parses a single CSV line following RFC 4180 basic rules:
 *   - Values are comma-separated
 *   - A value may be enclosed in double-quotes
 *   - Within a quoted value, a literal double-quote is represented as ""
 *   - Unquoted values are trimmed of surrounding whitespace
 *
 * Returns an array of string values for the line.
 */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let i = 0;
  const len = line.length;

  while (i <= len) {
    if (i === len) {
      break;
    }

    if (line[i] === '"') {
      // Quoted field
      i++; // skip opening quote
      let value = "";
      while (i < len) {
        if (line[i] === '"') {
          if (i + 1 < len && line[i + 1] === '"') {
            // Escaped quote ""
            value += '"';
            i += 2;
          } else {
            // Closing quote
            i++;
            break;
          }
        } else {
          value += line[i];
          i++;
        }
      }
      fields.push(value);
      // Skip optional whitespace and the comma separator
      while (i < len && line[i] === " ") i++;
      if (i < len && line[i] === ",") i++;
    } else {
      // Unquoted field — read until next comma
      const start = i;
      while (i < len && line[i] !== ",") {
        i++;
      }
      fields.push(line.slice(start, i).trim());
      if (i < len && line[i] === ",") {
        i++;
        // If this is the last character (trailing comma), push empty field
        if (i === len) {
          fields.push("");
        }
      }
    }
  }

  return fields;
}

// ─────────────────────────────────────────────
// Value validators
// ─────────────────────────────────────────────

/**
 * Validates a raw string value against a declared CatalogField dataType.
 * Empty/blank values are accepted for all types (nullable).
 * Returns an error message string if invalid, or null if valid.
 */
function validateFieldValue(
  value: string,
  dataType: string,
  fieldName: string,
): string | null {
  const trimmed = value.trim();

  // Empty/blank values are allowed regardless of type
  if (trimmed.length === 0) {
    return null;
  }

  switch (dataType) {
    case "number": {
      const parsed = parseFloat(trimmed);
      if (isNaN(parsed) || !isFinite(parsed)) {
        return `O campo '${fieldName}' deve ser um número decimal válido (ex: 123.45). Recebido: "${trimmed}"`;
      }
      break;
    }
    case "date": {
      if (!DATE_REGEX.test(trimmed)) {
        return `O campo '${fieldName}' deve estar no formato YYYY-MM-DD (ex: 2025-07-01). Recebido: "${trimmed}"`;
      }
      break;
    }
    // string, boolean, text: no strict format validation
  }

  return null;
}

// ─────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────

export const csvIngestorService = {
  /**
   * Processes a CSV buffer and creates CatalogRecords for valid rows.
   *
   * @param knowledgeBaseId  Target KnowledgeBase ID
   * @param csvBuffer        Raw CSV bytes (UTF-8)
   * @returns                IngestResult with created count, error count and details
   *
   * @throws ValidationError  if file exceeds 10 MB
   * @throws ValidationError  if data lines exceed 10.000
   * @throws ValidationError  if the upload would push total records above 50.000
   */
  async ingest(
    knowledgeBaseId: string,
    csvBuffer: Buffer,
  ): Promise<IngestResult> {
    // ── 1. Validate file size ─────────────────────────────────────────────
    if (csvBuffer.byteLength > MAX_FILE_SIZE_BYTES) {
      throw new ValidationError(
        `O arquivo CSV excede o limite de 10 MB (tamanho recebido: ${(csvBuffer.byteLength / (1024 * 1024)).toFixed(2)} MB).`,
      );
    }

    // ── 2. Decode as UTF-8 and split into lines ───────────────────────────
    let raw: string;
    try {
      raw = csvBuffer.toString("utf-8");
    } catch {
      throw new ValidationError(
        "Não foi possível decodificar o arquivo CSV. Verifique se o encoding é UTF-8.",
      );
    }

    // Strip BOM if present
    if (raw.charCodeAt(0) === 0xfeff) {
      raw = raw.slice(1);
    }

    const allLines = raw.split(/\r?\n/);

    // ── 3. Find header (first non-empty line) ─────────────────────────────
    const headerLineIndex = allLines.findIndex((l) => l.trim().length > 0);

    if (headerLineIndex === -1) {
      throw new ValidationError(
        "O arquivo CSV está vazio. Nenhum conteúdo foi encontrado.",
      );
    }

    const headerLine = allLines[headerLineIndex] ?? "";
    const rawHeaders = parseCsvLine(headerLine);

    if (rawHeaders.length === 0 || rawHeaders.every((h) => h.trim().length === 0)) {
      throw new ValidationError(
        "O arquivo CSV não contém linha de cabeçalho válida. A primeira linha deve listar os nomes das colunas.",
      );
    }

    // ── 4. Collect data lines (skip blank lines after header) ─────────────
    const dataLines: string[] = [];
    for (let i = headerLineIndex + 1; i < allLines.length; i++) {
      const line = allLines[i] ?? "";
      if (line.trim().length === 0) continue; // skip blank lines
      dataLines.push(line);
    }

    // ── 5. Validate data line count ───────────────────────────────────────
    if (dataLines.length > MAX_DATA_LINES) {
      throw new ValidationError(
        `O arquivo CSV contém ${dataLines.length.toLocaleString("pt-BR")} linhas de dados, excedendo o limite de ${MAX_DATA_LINES.toLocaleString("pt-BR")} linhas por upload.`,
      );
    }

    // ── 6. Validate total record limit BEFORE processing ─────────────────
    const currentCount =
      await catalogRepository.countRecordsByKBId(knowledgeBaseId);

    if (currentCount + dataLines.length > MAX_RECORDS_PER_KB) {
      throw new ValidationError(
        `O upload resultaria em ${(currentCount + dataLines.length).toLocaleString("pt-BR")} registros, excedendo o limite de ${MAX_RECORDS_PER_KB.toLocaleString("pt-BR")} por base de conhecimento. Contagem atual: ${currentCount.toLocaleString("pt-BR")}.`,
      );
    }

    // ── 7. Load field definitions and build fieldName → dataType map ──────
    const fields = await catalogRepository.findFieldsByKBId(knowledgeBaseId);
    const fieldMap = new Map<string, string>(
      fields.map((f) => [f.name, f.dataType]),
    );

    // ── 8. Map CSV column indices to matched field names ──────────────────
    // columnMapping[colIdx] = fieldName | null (null = column not recognized)
    const columnMapping: (string | null)[] = rawHeaders.map((header) => {
      const trimmed = header.trim();
      return fieldMap.has(trimmed) ? trimmed : null;
    });

    // ── 9. Process each data row ──────────────────────────────────────────
    const validItems: Array<{ knowledgeBaseId: string; data: string }> = [];
    const errorDetails: RowError[] = [];

    for (let rowIdx = 0; rowIdx < dataLines.length; rowIdx++) {
      const line = dataLines[rowIdx] ?? "";
      const values = parseCsvLine(line);
      const rowNumber = rowIdx + 1; // 1-based

      const rowErrors: RowError[] = [];
      const rowData: Record<string, unknown> = {};

      for (let colIdx = 0; colIdx < columnMapping.length; colIdx++) {
        const fieldName = columnMapping[colIdx];
        if (fieldName == null) continue; // unrecognized column — skip (null or undefined)

        const rawValue = colIdx < values.length ? (values[colIdx] ?? "") : "";
        const dataType = fieldMap.get(fieldName) ?? "string";

        const errorMsg = validateFieldValue(rawValue, dataType, fieldName);

        if (errorMsg !== null) {
          rowErrors.push({
            row: rowNumber,
            field: fieldName,
            message: errorMsg,
          });
        } else {
          // Coerce value to the appropriate JS type
          rowData[fieldName] = coerceValue(rawValue.trim(), dataType);
        }
      }

      if (rowErrors.length > 0) {
        // Row has at least one invalid field — skip the row entirely
        errorDetails.push(...rowErrors);
      } else {
        validItems.push({
          knowledgeBaseId,
          data: JSON.stringify(rowData),
        });
      }
    }

    // ── 10. Bulk-insert valid rows ─────────────────────────────────────────
    let created = 0;
    if (validItems.length > 0) {
      created = await catalogRepository.createManyRecords(validItems);
    }

    // ── 11. Return result ─────────────────────────────────────────────────
    return {
      created,
      errors: errorDetails.length,
      errorDetails,
    };
  },
};

// ─────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────

/**
 * Coerces a validated raw string value to the appropriate JavaScript type
 * based on the declared CatalogField dataType.
 *
 * Assumes the value has already passed `validateFieldValue`.
 * Empty strings are converted to null.
 */
function coerceValue(
  value: string,
  dataType: string,
): string | number | boolean | null {
  if (value.length === 0) return null;

  switch (dataType) {
    case "number":
      return parseFloat(value);
    case "boolean":
      return value.toLowerCase() === "true" || value === "1";
    // string, date, text: keep as-is
    default:
      return value;
  }
}
