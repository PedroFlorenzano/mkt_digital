import { catalogRecordService } from "@server/services/catalogRecord.service";
import { catalogRepository } from "@server/repositories/catalog.repository";
import { knowledgeBaseRepository } from "@server/repositories/knowledgeBase.repository";
import { companyService } from "@server/services/company.service";
import { ValidationError, NotFoundError } from "@server/lib/errors";

jest.mock("@server/repositories/catalog.repository");
jest.mock("@server/repositories/knowledgeBase.repository");
jest.mock("@server/services/company.service");
jest.mock("@server/lib/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

const kbRepo = jest.mocked(knowledgeBaseRepository);
const catRepo = jest.mocked(catalogRepository);
const company = jest.mocked(companyService);

const mockKB = { id: "kb_01", companyId: "cmp_01", name: "Products", catalogType: "products", description: null, createdAt: new Date(), updatedAt: new Date() };
const mockRecord = { id: "rec_01", knowledgeBaseId: "kb_01", data: '{"name":"Product A","price":"10"}', createdAt: new Date(), updatedAt: new Date() };

beforeEach(() => {
  jest.clearAllMocks();
  kbRepo.findById.mockResolvedValue(mockKB as never);
  company.assertOwnership.mockResolvedValue({} as never);
  catRepo.findFieldsByKBId.mockResolvedValue([
    { id: "f1", knowledgeBaseId: "kb_01", name: "price", dataType: "number", isFilterable: true, displayOrder: 0, createdAt: new Date(), updatedAt: new Date() },
    { id: "f2", knowledgeBaseId: "kb_01", name: "date", dataType: "date", isFilterable: false, displayOrder: 1, createdAt: new Date(), updatedAt: new Date() },
  ] as never);
});

describe("catalogRecordService.create", () => {
  it("creates record with valid data", async () => {
    catRepo.countRecordsByKBId.mockResolvedValue(0);
    catRepo.createRecord.mockResolvedValue(mockRecord as never);

    const result = await catalogRecordService.create("usr_01", "kb_01", { price: "10.5" });
    expect(result.id).toBe("rec_01");
  });

  it("throws ValidationError for invalid number field", async () => {
    catRepo.countRecordsByKBId.mockResolvedValue(0);
    await expect(
      catalogRecordService.create("usr_01", "kb_01", { price: "not-a-number" })
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError for invalid date format", async () => {
    catRepo.countRecordsByKBId.mockResolvedValue(0);
    await expect(
      catalogRecordService.create("usr_01", "kb_01", { date: "01/07/2025" })
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError when record limit reached", async () => {
    catRepo.countRecordsByKBId.mockResolvedValue(50_000);
    await expect(
      catalogRecordService.create("usr_01", "kb_01", { price: "10" })
    ).rejects.toThrow(ValidationError);
  });

  it("throws NotFoundError when KB not found", async () => {
    kbRepo.findById.mockResolvedValue(null);
    await expect(
      catalogRecordService.create("usr_01", "kb_01", { price: "10" })
    ).rejects.toThrow(NotFoundError);
  });
});

describe("catalogRecordService.list", () => {
  it("returns paginated results", async () => {
    catRepo.findRecordsByKBId.mockResolvedValue({ records: [mockRecord], total: 1 } as never);
    const result = await catalogRecordService.list("usr_01", "kb_01", 1, 20);
    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.page).toBe(1);
  });
});

describe("catalogRecordService.delete", () => {
  it("deletes existing record", async () => {
    catRepo.findRecordById.mockResolvedValue(mockRecord as never);
    catRepo.deleteRecord.mockResolvedValue(undefined as never);
    await catalogRecordService.delete("usr_01", "rec_01");
    expect(catRepo.deleteRecord).toHaveBeenCalledWith("rec_01");
  });

  it("throws NotFoundError when record not found", async () => {
    catRepo.findRecordById.mockResolvedValue(null as never);
    await expect(catalogRecordService.delete("usr_01", "rec_missing")).rejects.toThrow(NotFoundError);
  });
});

describe("catalogRecordService.deleteAll", () => {
  it("deletes all records for KB", async () => {
    catRepo.deleteAllRecordsByKBId.mockResolvedValue(5 as never);
    const count = await catalogRecordService.deleteAll("usr_01", "kb_01");
    expect(count).toBe(5);
  });
});
