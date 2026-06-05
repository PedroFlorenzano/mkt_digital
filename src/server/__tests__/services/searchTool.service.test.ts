import { searchToolService } from "@server/services/searchTool.service";
import { catalogRepository } from "@server/repositories/catalog.repository";

jest.mock("@server/repositories/catalog.repository");

const catRepo = jest.mocked(catalogRepository);

const mockFields = [
  { id: "f1", knowledgeBaseId: "kb_01", name: "name", dataType: "string", isFilterable: true, displayOrder: 0, createdAt: new Date(), updatedAt: new Date() },
  { id: "f2", knowledgeBaseId: "kb_01", name: "price", dataType: "number", isFilterable: true, displayOrder: 1, createdAt: new Date(), updatedAt: new Date() },
  { id: "f3", knowledgeBaseId: "kb_01", name: "active", dataType: "boolean", isFilterable: true, displayOrder: 2, createdAt: new Date(), updatedAt: new Date() },
  { id: "f4", knowledgeBaseId: "kb_01", name: "created", dataType: "date", isFilterable: true, displayOrder: 3, createdAt: new Date(), updatedAt: new Date() },
  { id: "f5", knowledgeBaseId: "kb_01", name: "internal", dataType: "string", isFilterable: false, displayOrder: 4, createdAt: new Date(), updatedAt: new Date() },
];

const makeRecord = (id: string, data: Record<string, unknown>) => ({
  id, knowledgeBaseId: "kb_01", data: JSON.stringify(data), createdAt: new Date(), updatedAt: new Date(),
});

const mockRecords = [
  makeRecord("r1", { name: "Widget A", price: 10, active: true, created: "2025-01-15", internal: "x" }),
  makeRecord("r2", { name: "Widget B", price: 25, active: false, created: "2025-03-20", internal: "y" }),
  makeRecord("r3", { name: "Gadget C", price: 50, active: true, created: "2025-06-01", internal: "z" }),
];

beforeEach(() => {
  jest.clearAllMocks();
  catRepo.findAllRecordsByKBId.mockResolvedValue(mockRecords as never);
  catRepo.findFieldsByKBId.mockResolvedValue(mockFields as never);
});

describe("searchToolService.search", () => {
  it("filters by string (case-insensitive partial match)", async () => {
    const results = await searchToolService.search("kb_01", { name: "widget" });
    expect(results).toHaveLength(2);
  });

  it("filters by number eq", async () => {
    const results = await searchToolService.search("kb_01", { price: { eq: 25 } });
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe("r2");
  });

  it("filters by number gte/lte", async () => {
    const results = await searchToolService.search("kb_01", { price: { gte: 20, lte: 50 } });
    expect(results).toHaveLength(2);
  });

  it("filters by number between", async () => {
    const results = await searchToolService.search("kb_01", { price: { between: { min: 5, max: 15 } } });
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe("r1");
  });

  it("filters by boolean", async () => {
    const results = await searchToolService.search("kb_01", { active: true });
    expect(results).toHaveLength(2);
  });

  it("filters by date eq", async () => {
    const results = await searchToolService.search("kb_01", { created: { eq: "2025-03-20" } });
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe("r2");
  });

  it("filters by date gte", async () => {
    const results = await searchToolService.search("kb_01", { created: { gte: "2025-03-01" } });
    expect(results).toHaveLength(2);
  });

  it("applies AND semantics for multiple filters", async () => {
    const results = await searchToolService.search("kb_01", { active: true, price: { gte: 40 } });
    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe("r3");
  });

  it("ignores non-filterable fields", async () => {
    const results = await searchToolService.search("kb_01", { internal: "x" });
    // internal is not filterable, so no valid filters → returns first 10
    expect(results).toHaveLength(3);
  });

  it("returns first 10 records when no valid filters", async () => {
    const results = await searchToolService.search("kb_01", {});
    expect(results).toHaveLength(3);
  });

  it("limits results to 10", async () => {
    const manyRecords = Array.from({ length: 15 }, (_, i) =>
      makeRecord(`r${i}`, { name: "item", price: 10, active: true, created: "2025-01-01" })
    );
    catRepo.findAllRecordsByKBId.mockResolvedValue(manyRecords as never);

    const results = await searchToolService.search("kb_01", { active: true });
    expect(results.length).toBeLessThanOrEqual(10);
  });
});
