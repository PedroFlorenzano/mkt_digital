/**
 * Unit tests for companyService — multi-company methods.
 * All Prisma and repository calls are mocked.
 */

import { companyService } from "../../services/company.service";
import { companyRepository } from "../../repositories/company.repository";
import { ForbiddenError, ValidationError } from "../../lib/errors";
import type { Company } from "@prisma/client";

// Mock the repository
jest.mock("../../repositories/company.repository", () => ({
  companyRepository: {
    findAllByUserId: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    deleteById: jest.fn(),
    countByUserId: jest.fn(),
  },
}));

// Mock plan-guard (no limits in internal platform)
jest.mock("../../lib/plan-guard", () => ({
  assertCompanyLimit: jest.fn(),
}));

jest.mock("../../lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const repo = companyRepository as jest.Mocked<typeof companyRepository>;

function makeCompany(overrides: Partial<Company> = {}): Company {
  return {
    id: "cmp_01",
    userId: "usr_01",
    name: "Acme",
    description: null,
    sector: null,
    objective: null,
    tone: "professional",
    logoUrl: null,
    colors: null,
    driveUrl: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  };
}

afterEach(() => jest.clearAllMocks());

// ─── listByUserId ─────────────────────────────────────────────────────────────

describe("companyService.listByUserId", () => {
  it("delegates to repository", async () => {
    repo.findAllByUserId.mockResolvedValue([{ id: "cmp_01", name: "Acme", sector: null, logoUrl: null }]);
    const result = await companyService.listByUserId("usr_01");
    expect(repo.findAllByUserId).toHaveBeenCalledWith("usr_01");
    expect(result).toHaveLength(1);
  });
});

// ─── createCompany ────────────────────────────────────────────────────────────

describe("companyService.createCompany", () => {
  it("creates a company with valid input", async () => {
    repo.countByUserId.mockResolvedValue(0);
    repo.create.mockResolvedValue(makeCompany());

    const result = await companyService.createCompany("usr_01", { name: "Acme" });
    expect(repo.create).toHaveBeenCalledWith("usr_01", expect.objectContaining({ name: "Acme" }));
    expect(result.name).toBe("Acme");
  });

  it("trims the company name", async () => {
    repo.countByUserId.mockResolvedValue(0);
    repo.create.mockResolvedValue(makeCompany({ name: "Acme" }));

    await companyService.createCompany("usr_01", { name: "  Acme  " });
    expect(repo.create).toHaveBeenCalledWith("usr_01", expect.objectContaining({ name: "Acme" }));
  });

  it("rejects name with 1 character", async () => {
    await expect(
      companyService.createCompany("usr_01", { name: "A" })
    ).rejects.toThrow(ValidationError);
  });

  it("rejects name with 201 characters", async () => {
    await expect(
      companyService.createCompany("usr_01", { name: "A".repeat(201) })
    ).rejects.toThrow(ValidationError);
  });

  it("accepts name with exactly 2 characters", async () => {
    repo.countByUserId.mockResolvedValue(0);
    repo.create.mockResolvedValue(makeCompany({ name: "AB" }));

    await expect(
      companyService.createCompany("usr_01", { name: "AB" })
    ).resolves.toBeDefined();
  });

  it("accepts name with exactly 200 characters", async () => {
    repo.countByUserId.mockResolvedValue(0);
    repo.create.mockResolvedValue(makeCompany({ name: "A".repeat(200) }));

    await expect(
      companyService.createCompany("usr_01", { name: "A".repeat(200) })
    ).resolves.toBeDefined();
  });
});

// ─── updateCompany ────────────────────────────────────────────────────────────

describe("companyService.updateCompany", () => {
  it("updates provided fields", async () => {
    repo.update.mockResolvedValue(makeCompany({ name: "New Name" }));

    const result = await companyService.updateCompany("usr_01", "cmp_01", { name: "New Name" });
    expect(repo.update).toHaveBeenCalledWith("cmp_01", expect.objectContaining({ name: "New Name" }));
    expect(result.name).toBe("New Name");
  });

  it("rejects invalid name if provided", async () => {
    await expect(
      companyService.updateCompany("usr_01", "cmp_01", { name: "X" })
    ).rejects.toThrow(ValidationError);
  });

  it("does not call update for invalid name", async () => {
    await expect(
      companyService.updateCompany("usr_01", "cmp_01", { name: "X" })
    ).rejects.toThrow();
    expect(repo.update).not.toHaveBeenCalled();
  });

  it("skips name validation when name is not provided", async () => {
    repo.update.mockResolvedValue(makeCompany({ sector: "Tech" }));
    await companyService.updateCompany("usr_01", "cmp_01", { sector: "Tech" });
    expect(repo.update).toHaveBeenCalled();
  });
});

// ─── deleteCompany ────────────────────────────────────────────────────────────

describe("companyService.deleteCompany", () => {
  it("deletes when caller owns the company", async () => {
    repo.findById.mockResolvedValue(makeCompany());
    repo.deleteById.mockResolvedValue();

    await companyService.deleteCompany("usr_01", "cmp_01");
    expect(repo.deleteById).toHaveBeenCalledWith("cmp_01");
  });

  it("throws ForbiddenError when company not found", async () => {
    repo.findById.mockResolvedValue(null);
    await expect(
      companyService.deleteCompany("usr_01", "cmp_01")
    ).rejects.toThrow(ForbiddenError);
  });

  it("throws ForbiddenError when caller does not own the company", async () => {
    repo.findById.mockResolvedValue(makeCompany({ userId: "usr_OTHER" }));
    await expect(
      companyService.deleteCompany("usr_01", "cmp_01")
    ).rejects.toThrow(ForbiddenError);
  });
});

// ─── assertOwnership ─────────────────────────────────────────────────────────

describe("companyService.assertOwnership", () => {
  it("returns company when ownership is valid", async () => {
    const company = makeCompany();
    repo.findById.mockResolvedValue(company);

    const result = await companyService.assertOwnership("usr_01", "cmp_01");
    expect(result).toBe(company);
  });

  it("throws opaque ForbiddenError when company does not exist", async () => {
    repo.findById.mockResolvedValue(null);
    await expect(
      companyService.assertOwnership("usr_01", "cmp_missing")
    ).rejects.toThrow(ForbiddenError);
  });

  it("throws opaque ForbiddenError when userId does not match", async () => {
    repo.findById.mockResolvedValue(makeCompany({ userId: "usr_OTHER" }));
    await expect(
      companyService.assertOwnership("usr_01", "cmp_01")
    ).rejects.toThrow(ForbiddenError);
  });

  it("error message is the same for not-found and wrong-owner (opaque)", async () => {
    repo.findById.mockResolvedValueOnce(null);
    let errorA: Error | undefined;
    try { await companyService.assertOwnership("usr_01", "cmp_01"); } catch (e) { errorA = e as Error; }

    repo.findById.mockResolvedValueOnce(makeCompany({ userId: "usr_OTHER" }));
    let errorB: Error | undefined;
    try { await companyService.assertOwnership("usr_01", "cmp_01"); } catch (e) { errorB = e as Error; }

    expect(errorA?.message).toBe(errorB?.message);
  });
});
