import { kbAgentService } from "@server/services/kbAgent.service";
import { kbAgentRepository } from "@server/repositories/kbAgent.repository";
import { knowledgeBaseRepository } from "@server/repositories/knowledgeBase.repository";
import { companyService } from "@server/services/company.service";
import { prisma } from "@server/lib/prisma";
import { ValidationError, NotFoundError, ForbiddenError, ConflictError } from "@server/lib/errors";

jest.mock("@server/repositories/kbAgent.repository");
jest.mock("@server/repositories/knowledgeBase.repository");
jest.mock("@server/services/company.service");
jest.mock("@server/lib/prisma", () => ({
  prisma: {
    whatsAppAgent: { count: jest.fn() },
    kBAgent: { count: jest.fn() },
  },
}));
jest.mock("@server/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const mockKB = {
  id: "kb-1",
  companyId: "company-1",
  name: "Catalog",
  catalogType: "ecommerce",
  description: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockKBAgent = {
  id: "kbagent-1",
  knowledgeBaseId: "kb-1",
  companyId: "company-1",
  name: "KB Agent",
  instanceName: "kb-instance",
  evolutionApiUrl: "https://api.evolution.com",
  evolutionApiKey: "key-123",
  systemPrompt: "You are a catalog assistant for our store.",
  delaySeconds: 3,
  maxMessagesPerDay: 50,
  status: "active",
  createdAt: new Date(),
  updatedAt: new Date(),
};

const validCreateInput = {
  name: "KB Agent",
  instanceName: "kb-instance",
  evolutionApiUrl: "https://api.evolution.com",
  evolutionApiKey: "key-123",
  systemPrompt: "You are a catalog assistant for our store.",
};

describe("KBAgentService", () => {
  beforeEach(() => jest.clearAllMocks());

  describe("getByKBId", () => {
    it("returns agent when KB exists and user owns it", async () => {
      jest.mocked(knowledgeBaseRepository.findById).mockResolvedValue(mockKB as any);
      jest.mocked(companyService.assertOwnership).mockResolvedValue(undefined as any);
      jest.mocked(kbAgentRepository.findByKnowledgeBaseId).mockResolvedValue(mockKBAgent as any);

      const result = await kbAgentService.getByKBId("user-1", "kb-1");
      expect(result).toEqual(mockKBAgent);
    });

    it("throws NotFoundError when KB does not exist", async () => {
      jest.mocked(knowledgeBaseRepository.findById).mockResolvedValue(null);

      await expect(kbAgentService.getByKBId("user-1", "nonexistent")).rejects.toThrow(NotFoundError);
    });

    it("returns null when KB has no agent", async () => {
      jest.mocked(knowledgeBaseRepository.findById).mockResolvedValue(mockKB as any);
      jest.mocked(companyService.assertOwnership).mockResolvedValue(undefined as any);
      jest.mocked(kbAgentRepository.findByKnowledgeBaseId).mockResolvedValue(null);

      const result = await kbAgentService.getByKBId("user-1", "kb-1");
      expect(result).toBeNull();
    });
  });

  describe("create", () => {
    beforeEach(() => {
      jest.mocked(knowledgeBaseRepository.findById).mockResolvedValue(mockKB as any);
      jest.mocked(companyService.assertOwnership).mockResolvedValue(undefined as any);
      jest.mocked(kbAgentRepository.findByKnowledgeBaseId).mockResolvedValue(null);
      jest.mocked(prisma.whatsAppAgent.count).mockResolvedValue(0);
      jest.mocked(prisma.kBAgent.count).mockResolvedValue(0);
      jest.mocked(kbAgentRepository.create).mockResolvedValue(mockKBAgent as any);
    });

    it("creates KBAgent with valid input", async () => {
      const result = await kbAgentService.create("user-1", "kb-1", validCreateInput);

      expect(kbAgentRepository.create).toHaveBeenCalledWith(expect.objectContaining({
        knowledgeBaseId: "kb-1",
        companyId: "company-1",
        name: "KB Agent",
        instanceName: "kb-instance",
        status: "active",
        delaySeconds: 3,
        maxMessagesPerDay: 50,
      }));
      expect(result.id).toBe("kbagent-1");
    });

    it("throws NotFoundError when KB does not exist", async () => {
      jest.mocked(knowledgeBaseRepository.findById).mockResolvedValue(null);

      await expect(
        kbAgentService.create("user-1", "nonexistent", validCreateInput)
      ).rejects.toThrow(NotFoundError);
    });

    it("throws ForbiddenError when user does not own company", async () => {
      jest.mocked(companyService.assertOwnership).mockRejectedValue(new ForbiddenError());

      await expect(
        kbAgentService.create("user-2", "kb-1", validCreateInput)
      ).rejects.toThrow(ForbiddenError);
    });

    it("throws ConflictError when KB already has an agent", async () => {
      jest.mocked(kbAgentRepository.findByKnowledgeBaseId).mockResolvedValue(mockKBAgent as any);

      await expect(
        kbAgentService.create("user-1", "kb-1", validCreateInput)
      ).rejects.toThrow(ConflictError);
    });

    it("throws ConflictError when instanceName is already in use", async () => {
      jest.mocked(prisma.whatsAppAgent.count).mockResolvedValue(1);

      await expect(
        kbAgentService.create("user-1", "kb-1", validCreateInput)
      ).rejects.toThrow(ConflictError);
    });

    it("throws ValidationError when instanceName contains invalid chars", async () => {
      await expect(
        kbAgentService.create("user-1", "kb-1", { ...validCreateInput, instanceName: "invalid name!" })
      ).rejects.toThrow(ValidationError);
    });

    it("throws ValidationError when systemPrompt is too short", async () => {
      await expect(
        kbAgentService.create("user-1", "kb-1", { ...validCreateInput, systemPrompt: "short" })
      ).rejects.toThrow(ValidationError);
    });

    it("throws ValidationError when delaySeconds is out of range", async () => {
      await expect(
        kbAgentService.create("user-1", "kb-1", { ...validCreateInput, delaySeconds: 0 })
      ).rejects.toThrow(ValidationError);
    });

    it("throws ValidationError when maxMessagesPerDay is out of range", async () => {
      await expect(
        kbAgentService.create("user-1", "kb-1", { ...validCreateInput, maxMessagesPerDay: 501 })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("update", () => {
    it("updates KBAgent with valid partial input", async () => {
      jest.mocked(kbAgentRepository.findById).mockResolvedValue(mockKBAgent as any);
      jest.mocked(companyService.assertOwnership).mockResolvedValue(undefined as any);
      jest.mocked(kbAgentRepository.update).mockResolvedValue({ ...mockKBAgent, name: "Updated" } as any);

      const result = await kbAgentService.update("user-1", "kbagent-1", { name: "Updated" });

      expect(kbAgentRepository.update).toHaveBeenCalledWith("kbagent-1", { name: "Updated" });
      expect(result.name).toBe("Updated");
    });

    it("throws NotFoundError when agent does not exist", async () => {
      jest.mocked(kbAgentRepository.findById).mockResolvedValue(null);

      await expect(
        kbAgentService.update("user-1", "nonexistent", { name: "X" })
      ).rejects.toThrow(NotFoundError);
    });

    it("throws ValidationError when updated name exceeds 100 chars", async () => {
      jest.mocked(kbAgentRepository.findById).mockResolvedValue(mockKBAgent as any);
      jest.mocked(companyService.assertOwnership).mockResolvedValue(undefined as any);

      await expect(
        kbAgentService.update("user-1", "kbagent-1", { name: "a".repeat(101) })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("toggleStatus", () => {
    it("toggles agent status", async () => {
      jest.mocked(kbAgentRepository.findById).mockResolvedValue(mockKBAgent as any);
      jest.mocked(companyService.assertOwnership).mockResolvedValue(undefined as any);
      jest.mocked(kbAgentRepository.toggleStatus).mockResolvedValue({ ...mockKBAgent, status: "paused" } as any);

      const result = await kbAgentService.toggleStatus("user-1", "kbagent-1");
      expect(result.status).toBe("paused");
    });

    it("throws NotFoundError when agent does not exist", async () => {
      jest.mocked(kbAgentRepository.findById).mockResolvedValue(null);

      await expect(kbAgentService.toggleStatus("user-1", "nonexistent")).rejects.toThrow(NotFoundError);
    });
  });

  describe("delete", () => {
    it("deletes agent after ownership check", async () => {
      jest.mocked(kbAgentRepository.findById).mockResolvedValue(mockKBAgent as any);
      jest.mocked(companyService.assertOwnership).mockResolvedValue(undefined as any);
      jest.mocked(kbAgentRepository.delete).mockResolvedValue(undefined as any);

      await kbAgentService.delete("user-1", "kbagent-1");

      expect(kbAgentRepository.delete).toHaveBeenCalledWith("kbagent-1");
    });

    it("throws ForbiddenError when user does not own company", async () => {
      jest.mocked(kbAgentRepository.findById).mockResolvedValue(mockKBAgent as any);
      jest.mocked(companyService.assertOwnership).mockRejectedValue(new ForbiddenError());

      await expect(kbAgentService.delete("user-2", "kbagent-1")).rejects.toThrow(ForbiddenError);
    });
  });

  describe("getById", () => {
    it("returns agent when found", async () => {
      jest.mocked(kbAgentRepository.findById).mockResolvedValue(mockKBAgent as any);
      const result = await kbAgentService.getById("kbagent-1");
      expect(result).toEqual(mockKBAgent);
    });

    it("returns null when not found", async () => {
      jest.mocked(kbAgentRepository.findById).mockResolvedValue(null);
      const result = await kbAgentService.getById("nonexistent");
      expect(result).toBeNull();
    });
  });
});
