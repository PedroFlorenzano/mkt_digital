/**
 * Unit tests for csvIngestor.service.ts
 *
 * Tests the ingest function covering:
 *   - File size validation (> 10 MB rejected)
 *   - Data line count validation (> 10.000 rejected)
 *   - Total record limit (upload would exceed 50.000)
 *   - Valid CSV: happy path — all rows created
 *   - Unrecognized columns are ignored
 *   - Invalid number values → row error, row skipped
 *   - Invalid date values → row error, row skipped
 *   - Empty values are accepted (treated as null)
 *   - Mixed valid/invalid rows: partial success
 *   - RFC 4180: quoted fields, escaped double-quotes
 *   - conservation property: created + errors === dataLines.length
 */

import { csvIngestorService } from "@server/services/csvIngestor.service";
import { ValidationError } from "@server/lib/errors";

// ── Mocks ──────────────────────────────────────────────────────────────────────

jest.mock("@server/repositories/catalog.repository", () => ({
  catalogRepository: {
    countRecordsByKBId: jest.fn(),
    findFieldsByKBId: jest.fn(),
    createManyRecords: jest.fn(),
  },
}));

jest.mock("@server/lib/prisma", () => ({
  prisma: {},
}));

import { catalogRepository } from "@server/repositories/catalog.repository";

const mockCount = jest.mocked(catalogRepository.countRecordsByKBId);
const mockFindFields = jest.mocked(catalogRepository.findFieldsByKBId);
const mockCreateMany = jest.mocked(catalogRepository.createManyRecords);

// ── Helpers ────────────────────────────────────────────────────────────────────

const KB_ID = "kb-test-01";

/** Build a minimal CatalogField-like object for mocking */
function field(name: string, dataType: string, isFilterable = false) {
  return { id: `f-${name}`, knowledgeBaseId: KB_ID, name, dataType, isFilterable, displayOrder: 0 };
}

/** Convert a string to a Buffer (UTF-8) */
function toBuffer(content: string): Buffer {
  return Buffer.from(content, "utf-8");
}

beforeEach(() => {
  jest.clearAllMocks();
  // Default: 0 existing records
  mockCount.mockResolvedValue(0);
  // Default: createMany returns count of items passed
  mockCreateMany.mockImplementation(async (items) => items.length);
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("csvIngestorService.ingest — file-level validations", () => {
  it("throws ValidationError when buffer exceeds 10 MB", async () => {
    const oversizedBuffer = Buffer.alloc(10 * 1024 * 1024 + 1);
    await expect(
      csvIngestorService.ingest(KB_ID, oversizedBuffer),
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError when data lines exceed 10.000", async () => {
    const header = "nome,valor\n";
    const row = "item,1\n";
    // 10.001 data lines
    const csv = header + row.repeat(10_001);
    mockFindFields.mockResolvedValue([field("nome", "string"), field("valor", "number")]);

    await expect(
      csvIngestorService.ingest(KB_ID, toBuffer(csv)),
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError when upload would exceed 50.000 records total", async () => {
    mockCount.mockResolvedValue(49_999);
    const csv = "nome\nAlpha\nBeta"; // 2 data rows → 49999 + 2 = 50001 > 50000
    mockFindFields.mockResolvedValue([field("nome", "string")]);

    await expect(
      csvIngestorService.ingest(KB_ID, toBuffer(csv)),
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError for empty CSV", async () => {
    await expect(
      csvIngestorService.ingest(KB_ID, toBuffer("")),
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError for CSV with only blank lines", async () => {
    await expect(
      csvIngestorService.ingest(KB_ID, toBuffer("   \n\n   \n")),
    ).rejects.toThrow(ValidationError);
  });
});

describe("csvIngestorService.ingest — happy path", () => {
  it("creates all rows when CSV is fully valid", async () => {
    const csv = "nome,preco\nCasa Verde,350000\nApto Blue,220000\n";
    mockFindFields.mockResolvedValue([
      field("nome", "string"),
      field("preco", "number"),
    ]);

    const result = await csvIngestorService.ingest(KB_ID, toBuffer(csv));

    expect(result.created).toBe(2);
    expect(result.errors).toBe(0);
    expect(result.errorDetails).toHaveLength(0);
  });

  it("passes correct JSON data to createManyRecords", async () => {
    const csv = "nome,preco\nProduto A,99.90\n";
    mockFindFields.mockResolvedValue([
      field("nome", "string"),
      field("preco", "number"),
    ]);

    await csvIngestorService.ingest(KB_ID, toBuffer(csv));

    expect(mockCreateMany).toHaveBeenCalledWith([
      {
        knowledgeBaseId: KB_ID,
        data: JSON.stringify({ nome: "Produto A", preco: 99.9 }),
      },
    ]);
  });

  it("ignores columns not matching any CatalogField", async () => {
    const csv = "nome,coluna_desconhecida,preco\nAlpha,ignorada,100\n";
    mockFindFields.mockResolvedValue([
      field("nome", "string"),
      field("preco", "number"),
    ]);

    const result = await csvIngestorService.ingest(KB_ID, toBuffer(csv));

    expect(result.created).toBe(1);
    expect(result.errors).toBe(0);
    // Verify unknown column not in the stored data
    const storedData = JSON.parse(
      (mockCreateMany.mock.calls[0]![0][0]!).data,
    ) as Record<string, unknown>;
    expect(storedData).not.toHaveProperty("coluna_desconhecida");
    expect(storedData).toHaveProperty("nome", "Alpha");
    expect(storedData).toHaveProperty("preco", 100);
  });

  it("accepts empty value for a typed field (treated as null)", async () => {
    const csv = "nome,preco\nAlpha,\n";
    mockFindFields.mockResolvedValue([
      field("nome", "string"),
      field("preco", "number"),
    ]);

    const result = await csvIngestorService.ingest(KB_ID, toBuffer(csv));

    expect(result.created).toBe(1);
    expect(result.errors).toBe(0);
    const storedData = JSON.parse(
      (mockCreateMany.mock.calls[0]![0][0]!).data,
    ) as Record<string, unknown>;
    expect(storedData.preco).toBeNull();
  });

  it("strips BOM from UTF-8 file", async () => {
    const csv = "\uFEFFnome\nAlpha\n";
    mockFindFields.mockResolvedValue([field("nome", "string")]);

    const result = await csvIngestorService.ingest(KB_ID, toBuffer(csv));

    expect(result.created).toBe(1);
    expect(result.errors).toBe(0);
  });

  it("handles CSV with CRLF line endings", async () => {
    const csv = "nome,preco\r\nCasa Verde,350000\r\nApto Blue,220000\r\n";
    mockFindFields.mockResolvedValue([
      field("nome", "string"),
      field("preco", "number"),
    ]);

    const result = await csvIngestorService.ingest(KB_ID, toBuffer(csv));

    expect(result.created).toBe(2);
    expect(result.errors).toBe(0);
  });

  it("does not call createManyRecords when all rows are invalid", async () => {
    const csv = "preco\nnao_e_numero\n";
    mockFindFields.mockResolvedValue([field("preco", "number")]);

    const result = await csvIngestorService.ingest(KB_ID, toBuffer(csv));

    expect(result.created).toBe(0);
    expect(result.errors).toBe(1);
    expect(mockCreateMany).not.toHaveBeenCalled();
  });
});

describe("csvIngestorService.ingest — row-level validation errors", () => {
  it("records error for invalid number value and skips that row", async () => {
    const csv = "nome,preco\nAlpha,not_a_number\nBeta,200\n";
    mockFindFields.mockResolvedValue([
      field("nome", "string"),
      field("preco", "number"),
    ]);

    const result = await csvIngestorService.ingest(KB_ID, toBuffer(csv));

    expect(result.created).toBe(1);
    expect(result.errors).toBe(1);
    expect(result.errorDetails).toHaveLength(1);
    expect(result.errorDetails[0]).toMatchObject({
      row: 1,
      field: "preco",
    });
  });

  it("records error for invalid date value and skips that row", async () => {
    const csv = "nome,data_ref\nAlpha,2025/07/01\nBeta,2025-07-02\n";
    mockFindFields.mockResolvedValue([
      field("nome", "string"),
      field("data_ref", "date"),
    ]);

    const result = await csvIngestorService.ingest(KB_ID, toBuffer(csv));

    expect(result.created).toBe(1);
    expect(result.errors).toBe(1);
    expect(result.errorDetails[0]).toMatchObject({
      row: 1,
      field: "data_ref",
    });
  });

  it("records all field errors in a single row but counts row once", async () => {
    const csv = "preco,data_ref\nnot_num,bad_date\n";
    mockFindFields.mockResolvedValue([
      field("preco", "number"),
      field("data_ref", "date"),
    ]);

    const result = await csvIngestorService.ingest(KB_ID, toBuffer(csv));

    // 2 field errors in 1 row
    expect(result.errors).toBe(2);
    expect(result.created).toBe(0);
    expect(result.errorDetails).toHaveLength(2);
  });

  it("assigns correct 1-based row numbers in errorDetails", async () => {
    const csv = "preco\ngood\nbad_2\ngood\nbad_4\n";
    mockFindFields.mockResolvedValue([field("preco", "number")]);

    const result = await csvIngestorService.ingest(KB_ID, toBuffer(csv));

    const errorRows = result.errorDetails.map((e) => e.row);
    expect(errorRows).toContain(2);
    expect(errorRows).toContain(4);
  });

  it("continues processing remaining rows after a row with errors", async () => {
    const csv = "preco\n100\nbad\n200\n";
    mockFindFields.mockResolvedValue([field("preco", "number")]);

    const result = await csvIngestorService.ingest(KB_ID, toBuffer(csv));

    expect(result.created).toBe(2);
    expect(result.errors).toBe(1);
  });
});

describe("csvIngestorService.ingest — RFC 4180 quoted fields", () => {
  it("parses quoted field values correctly", async () => {
    const csv = 'nome,descricao\n"Alpha","Produto com, vírgula"\n';
    mockFindFields.mockResolvedValue([
      field("nome", "string"),
      field("descricao", "string"),
    ]);

    const result = await csvIngestorService.ingest(KB_ID, toBuffer(csv));

    expect(result.created).toBe(1);
    const stored = JSON.parse(
      (mockCreateMany.mock.calls[0]![0][0]!).data,
    ) as Record<string, unknown>;
    expect(stored.descricao).toBe("Produto com, vírgula");
  });

  it("handles escaped double-quotes within a quoted field", async () => {
    const csv = 'nome,descricao\nAlpha,"Diz ""olá"" ao cliente"\n';
    mockFindFields.mockResolvedValue([
      field("nome", "string"),
      field("descricao", "string"),
    ]);

    await csvIngestorService.ingest(KB_ID, toBuffer(csv));

    const stored = JSON.parse(
      (mockCreateMany.mock.calls[0]![0][0]!).data,
    ) as Record<string, unknown>;
    expect(stored.descricao).toBe('Diz "olá" ao cliente');
  });
});

describe("csvIngestorService.ingest — column matching (case-sensitive)", () => {
  it("does not match columns when case differs", async () => {
    // Field is "Nome" (capital N), CSV column is "nome" (lowercase)
    const csv = "nome,preco\nAlpha,100\n";
    mockFindFields.mockResolvedValue([
      field("Nome", "string"),  // capital N — won't match "nome"
      field("preco", "number"),
    ]);

    const result = await csvIngestorService.ingest(KB_ID, toBuffer(csv));

    expect(result.created).toBe(1);
    // "nome" column is unrecognized (case mismatch), only "preco" stored
    const stored = JSON.parse(
      (mockCreateMany.mock.calls[0]![0][0]!).data,
    ) as Record<string, unknown>;
    expect(stored).not.toHaveProperty("Nome");
    expect(stored).not.toHaveProperty("nome");
    expect(stored).toHaveProperty("preco", 100);
  });
});

describe("csvIngestorService.ingest — conservation property (created + errors === dataLines)", () => {
  it("satisfies created + errors === total data rows for mixed CSV", async () => {
    const csv = [
      "nome,preco,data_ref",
      "Valid,100,2025-01-01",    // row 1: valid
      "Bad,abc,2025-01-02",      // row 2: invalid number
      "Good,200,2025-01-03",     // row 3: valid
      "AlsoBad,300,2025/01/04",  // row 4: invalid date
      "Last,400,2025-01-05",     // row 5: valid
    ].join("\n");

    mockFindFields.mockResolvedValue([
      field("nome", "string"),
      field("preco", "number"),
      field("data_ref", "date"),
    ]);

    const result = await csvIngestorService.ingest(KB_ID, toBuffer(csv));

    const dataLineCount = 5;
    expect(result.created + result.errors).toBe(dataLineCount);
    expect(result.created).toBe(3);
    expect(result.errors).toBe(2);
  });
});

describe("csvIngestorService.ingest — data type coercion", () => {
  it("stores number field as numeric type in JSON", async () => {
    const csv = "preco\n42.5\n";
    mockFindFields.mockResolvedValue([field("preco", "number")]);

    await csvIngestorService.ingest(KB_ID, toBuffer(csv));

    const stored = JSON.parse(
      (mockCreateMany.mock.calls[0]![0][0]!).data,
    ) as Record<string, unknown>;
    expect(typeof stored.preco).toBe("number");
    expect(stored.preco).toBe(42.5);
  });

  it("stores boolean field as boolean type from 'true' string", async () => {
    const csv = "disponivel\ntrue\n";
    mockFindFields.mockResolvedValue([field("disponivel", "boolean")]);

    await csvIngestorService.ingest(KB_ID, toBuffer(csv));

    const stored = JSON.parse(
      (mockCreateMany.mock.calls[0]![0][0]!).data,
    ) as Record<string, unknown>;
    expect(typeof stored.disponivel).toBe("boolean");
    expect(stored.disponivel).toBe(true);
  });

  it("stores boolean field as boolean type from '1' string", async () => {
    const csv = "disponivel\n1\n";
    mockFindFields.mockResolvedValue([field("disponivel", "boolean")]);

    await csvIngestorService.ingest(KB_ID, toBuffer(csv));

    const stored = JSON.parse(
      (mockCreateMany.mock.calls[0]![0][0]!).data,
    ) as Record<string, unknown>;
    expect(stored.disponivel).toBe(true);
  });

  it("stores date field as string in ISO format", async () => {
    const csv = "data_ref\n2025-07-01\n";
    mockFindFields.mockResolvedValue([field("data_ref", "date")]);

    await csvIngestorService.ingest(KB_ID, toBuffer(csv));

    const stored = JSON.parse(
      (mockCreateMany.mock.calls[0]![0][0]!).data,
    ) as Record<string, unknown>;
    expect(stored.data_ref).toBe("2025-07-01");
  });

  it("stores string field unchanged", async () => {
    const csv = "nome\nHello World\n";
    mockFindFields.mockResolvedValue([field("nome", "string")]);

    await csvIngestorService.ingest(KB_ID, toBuffer(csv));

    const stored = JSON.parse(
      (mockCreateMany.mock.calls[0]![0][0]!).data,
    ) as Record<string, unknown>;
    expect(stored.nome).toBe("Hello World");
  });
});
