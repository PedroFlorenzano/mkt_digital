import { companyService } from "@server/services/company.service";
import { companyRepository } from "@server/repositories/company.repository";
import { ValidationError, NotFoundError } from "@server/lib/errors";

jest.mock("@server/repositories/company.repository");
jest.mock("@server/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const mockCompany = {
  id: "company-1",
  userId: "user-1",
  name: "Test Co",
  description: null,
  sector: "Tecnologia",
  objective: null,
  tone: "professional",
  logoUrl: null,
  colors: '["#3B82F6"]',
  driveUrl: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("CompanyService", () => {
  beforeEach(() => jest.clearAllMocks());

  describe("upsert", () => {
    it("throws ValidationError when name is empty", async () => {
      await expect(
        companyService.upsert("user-1", { name: "" })
      ).rejects.toThrow(ValidationError);
    });

    it("throws ValidationError when name exceeds 200 chars", async () => {
      await expect(
        companyService.upsert("user-1", { name: "a".repeat(201) })
      ).rejects.toThrow(ValidationError);
    });

    it("upserts company with trimmed name", async () => {
      jest.mocked(companyRepository.upsert).mockResolvedValue(mockCompany);

      const result = await companyService.upsert("user-1", { name: "  Test Co  " });

      expect(companyRepository.upsert).toHaveBeenCalledWith(
        "user-1",
        expect.objectContaining({ name: "Test Co" })
      );
      expect(result.id).toBe("company-1");
    });
  });

  describe("updateLogo", () => {
    it("throws NotFoundError when company does not exist", async () => {
      jest.mocked(companyRepository.findByUserId).mockResolvedValue(null);

      await expect(
        companyService.updateLogo("user-1", "https://example.com/logo.png")
      ).rejects.toThrow(NotFoundError);
    });

    it("updates logo URL", async () => {
      jest.mocked(companyRepository.findByUserId).mockResolvedValue(mockCompany);
      jest.mocked(companyRepository.updateLogo).mockResolvedValue({
        ...mockCompany,
        logoUrl: "https://example.com/logo.png",
      });

      const result = await companyService.updateLogo("user-1", "https://example.com/logo.png");
      expect(result.logoUrl).toBe("https://example.com/logo.png");
    });
  });
});
