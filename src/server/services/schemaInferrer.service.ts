/**
 * schemaInferrer.service.ts
 *
 * Analyzes a CSV buffer to infer column types from the header and up to 20
 * sample data rows. Uses pure Node.js string manipulation — no external CSV
 * parsing libraries.
 *
 * Supported inferred types:
 *   - "number"  : ALL non-empty sample values are parseable as float
 *   - "boolean" : ALL non-empty sample values are one of: true|false|1|0 (case-insensitive)
 *   - "date"    : ALL non-empty sample values match /^\d{4}-\d{2}-\d{2}$/
 *   - "text"    : MAJORITY (> 50%) of non-empty sample values have length > 200
 *   - "string"  : default / ambiguous case
 *
 * Requirements: 2.7, 2.8, 2.10
 */

import { ValidationError } from "@server/lib/errors";

// ─────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────

export interface InferredField {
  name: string;
  dataType: "string" | "number" | "boolean" | "date" | "text";
  sampleValues: string[];
}

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
    // We've consumed all characters — add empty trailing field if line ends with comma
    if (i === len) {
      // Only push empty if we are at an expected field boundary
      // (handled by the comma logic below pushing an empty string)
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
// Type inference helpers
// ─────────────────────────────────────────────

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const BOOLEAN_VALUES = new Set(["true", "false", "1", "0"]);

function inferType(
  sampleValues: string[],
): "string" | "number" | "boolean" | "date" | "text" {
  const nonEmpty = sampleValues.filter((v) => v.length > 0);

  // No non-empty samples — default to string
  if (nonEmpty.length === 0) {
    return "string";
  }

  // number: ALL non-empty values parseable as float (not NaN)
  if (nonEmpty.every((v) => !isNaN(parseFloat(v)) && isFinite(Number(v)))) {
    return "number";
  }

  // boolean: ALL non-empty values are true|false|1|0 (case-insensitive)
  if (nonEmpty.every((v) => BOOLEAN_VALUES.has(v.toLowerCase()))) {
    return "boolean";
  }

  // date: ALL non-empty values match YYYY-MM-DD
  if (nonEmpty.every((v) => DATE_REGEX.test(v))) {
    return "date";
  }

  // text: MAJORITY (> 50%) of non-empty values have length > 200
  const longCount = nonEmpty.filter((v) => v.length > 200).length;
  if (longCount / nonEmpty.length > 0.5) {
    return "text";
  }

  // default
  return "string";
}

// ─────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────

export const schemaInferrerService = {
  /**
   * Analyzes a CSV buffer and returns inferred field definitions.
   *
   * @param csvBuffer  Raw CSV bytes. Must be UTF-8 encoded.
   * @returns          Array of InferredField, one per CSV column.
   *
   * @throws ValidationError  for empty file, missing/empty header, or invalid encoding.
   */
  async infer(csvBuffer: Buffer): Promise<InferredField[]> {
    // ── 1. Decode buffer as UTF-8 ──────────────────────────────────────────
    let raw: string;
    try {
      raw = csvBuffer.toString("utf-8");
    } catch {
      throw new ValidationError(
        "Não foi possível decodificar o arquivo CSV. Verifique se o encoding é UTF-8.",
      );
    }

    // Detect BOM and strip it
    if (raw.charCodeAt(0) === 0xfeff) {
      raw = raw.slice(1);
    }

    // Guard: reject files with null bytes (binary / corrupt)
    if (raw.includes("\0")) {
      throw new ValidationError(
        "O arquivo CSV contém bytes inválidos. Verifique se o encoding é UTF-8 e se o arquivo não está corrompido.",
      );
    }

    // ── 2. Split into lines ────────────────────────────────────────────────
    const lines = raw.split(/\r?\n/);

    // ── 3. Find first non-empty line (header) ─────────────────────────────
    const headerLineIndex = lines.findIndex((l) => l.trim().length > 0);

    if (headerLineIndex === -1) {
      throw new ValidationError(
        "O arquivo CSV está vazio. Nenhum conteúdo foi encontrado.",
      );
    }

    const headerLine = lines[headerLineIndex] ?? "";
    const headers = parseCsvLine(headerLine);

    if (headers.length === 0 || headers.every((h) => h.trim().length === 0)) {
      throw new ValidationError(
        "O arquivo CSV não contém linha de cabeçalho válida. A primeira linha deve listar os nomes das colunas.",
      );
    }

    // Filter out completely empty header columns (trailing commas)
    const validHeaders = headers.map((h) => h.trim()).filter((h) => h.length > 0);
    if (validHeaders.length === 0) {
      throw new ValidationError(
        "O arquivo CSV não contém linha de cabeçalho válida. A primeira linha deve listar os nomes das colunas.",
      );
    }

    // ── 4. Collect up to 20 data rows ──────────────────────────────────────
    const dataLines: string[][] = [];
    for (
      let i = headerLineIndex + 1;
      i < lines.length && dataLines.length < 20;
      i++
    ) {
      const line = lines[i] ?? "";
      if (line.trim().length === 0) continue; // skip blank lines
      dataLines.push(parseCsvLine(line));
    }

    // ── 5. Build column-indexed sample values ──────────────────────────────
    // Pair each valid header name with its original column index
    interface ColumnDef {
      name: string;
      colIdx: number;
      samples: string[];
    }

    const columns: ColumnDef[] = [];

    for (let col = 0; col < headers.length; col++) {
      const name = (headers[col] ?? "").trim();
      if (name.length > 0) {
        columns.push({ name, colIdx: col, samples: [] });
      }
    }

    for (const row of dataLines) {
      for (const column of columns) {
        const val = column.colIdx < row.length ? (row[column.colIdx] ?? "") : "";
        column.samples.push(val);
      }
    }

    // ── 6. Infer types and build result ────────────────────────────────────
    const result: InferredField[] = columns.map((col) => ({
      name: col.name,
      dataType: inferType(col.samples),
      sampleValues: col.samples.slice(0, 20),
    }));

    return result;
  },
};
