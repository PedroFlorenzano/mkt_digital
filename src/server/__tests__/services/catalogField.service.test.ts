import { catalogFieldService } from "@server/services/catalogField.service";
import { catalogRepository } from "@server/repositories/catalog.repository";
import { knowledgeBaseRepository } from "@server/repositories/knowledgeBase.repository";
import { companyService } from "@server/services/company.service";
import { ValidationError, NotFoundError } from "@server/lib/errors";

jest.mock("@server/repositories/catalog.repository");
jest.mock("@server/repositories/knowledgeBase.repository");
jest.mock("@server/services/company.service");
jest.mock("@server/lib/logger", () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock("@server/lib/prisma", () => ({
  prisma: { catalogField: { findUnique: jest.fn() } },
}));

const kbRepo = jest.mocked(knowledgeBaseRepository);
const catRepo = jest.mocked(catalogRepository);
const company = jest.mocked(companyService);

const mockKB = { id: "kb_01", companyId: "cmp_01", name: "Products", catalogType: "products", description: null, createdAt: new Date(), updatedAt: new Date() };
const mockField = { id: "fld_01", knowledgeBaseId: "kb_01", name: "price", dataType: "number", isFilterable: true, displayOrder: 0, createdAt: new Date(), updatedAt: new Date() };

beforeEach(() => {
  jest.clearAllMocks();
  kbRepo.findById.mockResolvedValue(mockKB as never);
  company.assertOwnership.mockResolvedValue({} as never);
});

describe("catalogFieldService.create", () => {
  it("creates field with valid input", async () => {
    catRepo.countFieldsByKBId.mockResolvedValue(0);
    catRepo.createField.mockResolvedValue(mockField as never);

    const result = await catalogFieldService.create("usr_01", "kb_01", { name: "price", dataType: "number" });
    expect(result.name).toBe("price");
    expect(catRepo.createField).toHaveBeenCalled();
  });

  it("throws ValidationError for invalid name (special chars)", async () => {
    await expect(
      catalogFieldService.create("usr_01", "kb_01", { name: "my field!", dataType: "string" })
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError for empty name", async () => {
    await expect(
      catalogFieldService.create("usr_01", "kb_01", { name: "", dataType: "string" })
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError for name > 50 chars", async () => {
    await expect(
      catalogFieldService.create("usr_01", "kb_01", { name: "a".repeat(51), dataType: "string" })
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError for invalid dataType", async () => {
    await expect(
      catalogFieldService.create("usr_01", "kb_01", { name: "field1", dataType: "invalid" })
    ).rejects.toThrow(ValidationError);
  });

  it("throws ValidationError when field limit reached", async () => {
    catRepo.countFieldsByKBId.mockResolvedValue(50);
    await expect(
      catalogFieldService.create("usr_01", "kb_01", { name: "field1", dataType: "string" })
    ).rejects.toThrow(ValidationError);
  });

  it("throws NotFoundError when KB not found", async () => {
    kbRepo.findById.mockResolvedValue(null);
    await expect(
      catalogFieldService.create("usr_01", "kb_01", { name: "field1", dataType: "string" })
    ).rejects.toThrow(NotFoundError);
  });
});

describe("catalogFieldService.update", () => {
  it("validates name on update if provided", async () => {
    const { prisma } = await import("@server/lib/prisma");
    (prisma.catalogField.findUnique as jest.Mock).mockResolvedValue(mockField);

    await expect(
      catalogFieldService.update("usr_01", "fld_01", { name: "bad name!" })
    ).rejects.toThrow(ValidationError);
  });
});

describe("catalogFieldService.delete", () => {
  it("removes field from records before deleting", async () => {
    const { prisma } = await import("@server/lib/prisma");
    (prisma.catalogField.findUnique as jest.Mock).mockResolvedValue(mockField);
    catRepo.removeFieldFromAllRecords.mockResolvedValue(undefined as never);
    catRepo.deleteField.mockResolvedValue(undefined as never);

    await catalogFieldService.delete("usr_01", "fld_01");
    expect(catRepo.removeFieldFromAllRecords).toHaveBeenCalledWith("kb_01", "price");
    expect(catRepo.deleteField).toHaveBeenCalledWith("fld_01");
  });
});
