import { knowledgeBaseService } from "@server/services/knowledgeBase.service";
import { knowledgeBaseRepository } from "@server/repositories/knowledgeBase.repository";
import { companyService } from "@server/services/company.service";
import { ValidationError, NotFoundError, ForbiddenError } from "@server/lib/errors";

jest.mock("@server/repositories/knowledgeBase.repository");
jest.mock("@server/services/company.service");
jest.mock("@server/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const mockKB = {
  id: "kb-1",
  companyId: "company-1",
  name: "Product Catalog",
  catalogType: "ecommerce",
  description: "Our product catalog",
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

describe("KnowledgeBaseService", () => {
  beforeEach(() => jest.clearAllMocks());

  describe("listByCompanyId", () => {
    it("returns all KBs for a company", async () => {
      jest.mocked(knowledgeBaseRepository.findByCompanyId).mockResolvedValue([mockKB as any]);

      const result = await knowledgeBaseService.listByCompanyId("company-1");
      expect(result).toEqual([mockKB]);
    });
  });

  describe("getById", () => {
    it("returns KB when ownership is confirmed", async () => {
      jest.mocked(knowledgeBaseRepository.findById).mockResolvedValue(mockKB as any);
      jest.mocked(companyService.assertOwnership).mockResolvedValue(undefined as any);

      const result = await knowledgeBaseService.getById("user-1", "kb-1");
      expect(result).toEqual(mockKB);
    });

    it("throws NotFoundError when KB does not exist", async () => {
      jest.mocked(knowledgeBaseRepository.findById).mockResolvedValue(null);

      await expect(knowledgeBaseService.getById("user-1", "nonexistent")).rejects.toThrow(NotFoundError);
    });
  });

  describe("create", () => {
    it("creates KB with valid input", async () => {
      jest.mocked(companyService.assertOwnership).mockResolvedValue(undefined as any);
      jest.mocked(knowledgeBaseRepository.countByCompanyId).mockResolvedValue(0);
      jest.mocked(knowledgeBaseRepository.create).mockResolvedValue(mockKB as any);

      const result = await knowledgeBaseService.create("user-1", "company-1", {
        name: "Product Catalog",
        catalogType: "ecommerce",
      });

      expect(knowledgeBaseRepository.create).toHaveBeenCalledWith(expect.objectContaining({
        companyId: "company-1",
        name: "Product Catalog",
        catalogType: "ecommerce",
      }));
      expect(result.id).toBe("kb-1");
    });

    it("throws ForbiddenError when user does not own company", async () => {
      jest.mocked(companyService.assertOwnership).mockRejectedValue(new ForbiddenError());

      await expect(
        knowledgeBaseService.create("user-2", "company-1", { name: "X", catalogType: "y" })
      ).rejects.toThrow(ForbiddenError);
    });

    it("throws ValidationError when name is empty", async () => {
      jest.mocked(companyService.assertOwnership).mockResolvedValue(undefined as any);

      await expect(
        knowledgeBaseService.create("user-1", "company-1", { name: "", catalogType: "ecommerce" })
      ).rejects.toThrow(ValidationError);
    });

    it("throws ValidationError when catalogType is empty", async () => {
      jest.mocked(companyService.assertOwnership).mockResolvedValue(undefined as any);

      await expect(
        knowledgeBaseService.create("user-1", "company-1", { name: "Valid", catalogType: "" })
      ).rejects.toThrow(ValidationError);
    });

    it("throws ValidationError when description exceeds 500 chars", async () => {
      jest.mocked(companyService.assertOwnership).mockResolvedValue(undefined as any);

      await expect(
        knowledgeBaseService.create("user-1", "company-1", {
          name: "Valid",
          catalogType: "ecommerce",
          description: "a".repeat(501),
        })
      ).rejects.toThrow(ValidationError);
    });

    it("throws ValidationError when KB limit (10) is reached", async () => {
      jest.mocked(companyService.assertOwnership).mockResolvedValue(undefined as any);
      jest.mocked(knowledgeBaseRepository.countByCompanyId).mockResolvedValue(10);

      await expect(
        knowledgeBaseService.create("user-1", "company-1", { name: "Another", catalogType: "x" })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("update", () => {
    it("updates KB with valid partial input", async () => {
      jest.mocked(knowledgeBaseRepository.findById).mockResolvedValue(mockKB as any);
      jest.mocked(companyService.assertOwnership).mockResolvedValue(undefined as any);
      jest.mocked(knowledgeBaseRepository.update).mockResolvedValue({ ...mockKB, name: "Updated" } as any);

      const result = await knowledgeBaseService.update("user-1", "kb-1", { name: "Updated" });

      expect(knowledgeBaseRepository.update).toHaveBeenCalledWith("kb-1", { name: "Updated" });
      expect(result.name).toBe("Updated");
    });

    it("throws NotFoundError when KB does not exist", async () => {
      jest.mocked(knowledgeBaseRepository.findById).mockResolvedValue(null);

      await expect(
        knowledgeBaseService.update("user-1", "nonexistent", { name: "X" })
      ).rejects.toThrow(NotFoundError);
    });

    it("throws ValidationError when updated name is empty", async () => {
      jest.mocked(knowledgeBaseRepository.findById).mockResolvedValue(mockKB as any);
      jest.mocked(companyService.assertOwnership).mockResolvedValue(undefined as any);

      await expect(
        knowledgeBaseService.update("user-1", "kb-1", { name: "   " })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("delete", () => {
    it("deletes KB after ownership check", async () => {
      jest.mocked(knowledgeBaseRepository.findById).mockResolvedValue(mockKB as any);
      jest.mocked(companyService.assertOwnership).mockResolvedValue(undefined as any);
      jest.mocked(knowledgeBaseRepository.delete).mockResolvedValue(undefined as any);

      await knowledgeBaseService.delete("user-1", "kb-1");

      expect(knowledgeBaseRepository.delete).toHaveBeenCalledWith("kb-1");
    });

    it("throws ForbiddenError when user does not own company", async () => {
      jest.mocked(knowledgeBaseRepository.findById).mockResolvedValue(mockKB as any);
      jest.mocked(companyService.assertOwnership).mockRejectedValue(new ForbiddenError());

      await expect(knowledgeBaseService.delete("user-2", "kb-1")).rejects.toThrow(ForbiddenError);
    });
  });
});
