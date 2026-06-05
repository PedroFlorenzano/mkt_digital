import { agentService } from "@server/services/agent.service";
import { agentRepository } from "@server/repositories/agent.repository";
import { companyService } from "@server/services/company.service";
import { ValidationError, NotFoundError, ForbiddenError } from "@server/lib/errors";

jest.mock("@server/repositories/agent.repository");
jest.mock("@server/services/company.service");
jest.mock("@server/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const mockAgent = {
  id: "agent-1",
  companyId: "company-1",
  name: "Test Agent",
  description: null,
  instanceName: "test-instance",
  evolutionApiUrl: "https://api.evolution.com",
  evolutionApiKey: "key-123",
  systemPrompt: "You are a helpful assistant for our company.",
  delaySeconds: 3,
  maxMessagesPerSession: 50,
  status: "active",
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

const validCreateInput = {
  name: "Test Agent",
  instanceName: "test-instance",
  evolutionApiUrl: "https://api.evolution.com",
  evolutionApiKey: "key-123",
  systemPrompt: "You are a helpful assistant for our company.",
};

describe("AgentService", () => {
  beforeEach(() => jest.clearAllMocks());

  describe("listByCompanyId", () => {
    it("returns mapped agent summaries", async () => {
      jest.mocked(agentRepository.findByCompanyId).mockResolvedValue([mockAgent as any]);

      const result = await agentService.listByCompanyId("company-1");

      expect(result).toEqual([{
        id: "agent-1",
        name: "Test Agent",
        instanceName: "test-instance",
        status: "active",
        createdAt: mockAgent.createdAt,
      }]);
    });

    it("returns empty array when no agents exist", async () => {
      jest.mocked(agentRepository.findByCompanyId).mockResolvedValue([]);
      const result = await agentService.listByCompanyId("company-1");
      expect(result).toEqual([]);
    });
  });

  describe("createAgent", () => {
    it("creates agent with valid input", async () => {
      jest.mocked(companyService.assertOwnership).mockResolvedValue(undefined as any);
      jest.mocked(agentRepository.create).mockResolvedValue(mockAgent as any);

      const result = await agentService.createAgent("user-1", "company-1", validCreateInput);

      expect(companyService.assertOwnership).toHaveBeenCalledWith("user-1", "company-1");
      expect(agentRepository.create).toHaveBeenCalledWith(expect.objectContaining({
        companyId: "company-1",
        name: "Test Agent",
        status: "active",
        delaySeconds: 3,
        maxMessagesPerSession: 50,
      }));
      expect(result.id).toBe("agent-1");
    });

    it("throws ForbiddenError when user does not own company", async () => {
      jest.mocked(companyService.assertOwnership).mockRejectedValue(new ForbiddenError());

      await expect(
        agentService.createAgent("user-2", "company-1", validCreateInput)
      ).rejects.toThrow(ForbiddenError);
    });

    it("throws ValidationError when name is missing", async () => {
      jest.mocked(companyService.assertOwnership).mockResolvedValue(undefined as any);

      await expect(
        agentService.createAgent("user-1", "company-1", { ...validCreateInput, name: undefined as any })
      ).rejects.toThrow(ValidationError);
    });

    it("throws ValidationError when name exceeds 100 chars", async () => {
      jest.mocked(companyService.assertOwnership).mockResolvedValue(undefined as any);

      await expect(
        agentService.createAgent("user-1", "company-1", { ...validCreateInput, name: "a".repeat(101) })
      ).rejects.toThrow(ValidationError);
    });

    it("throws ValidationError when evolutionApiUrl has invalid protocol", async () => {
      jest.mocked(companyService.assertOwnership).mockResolvedValue(undefined as any);

      await expect(
        agentService.createAgent("user-1", "company-1", { ...validCreateInput, evolutionApiUrl: "ftp://invalid" })
      ).rejects.toThrow(ValidationError);
    });

    it("throws ValidationError when systemPrompt is too short", async () => {
      jest.mocked(companyService.assertOwnership).mockResolvedValue(undefined as any);

      await expect(
        agentService.createAgent("user-1", "company-1", { ...validCreateInput, systemPrompt: "short" })
      ).rejects.toThrow(ValidationError);
    });

    it("throws ValidationError when delaySeconds is out of range", async () => {
      jest.mocked(companyService.assertOwnership).mockResolvedValue(undefined as any);

      await expect(
        agentService.createAgent("user-1", "company-1", { ...validCreateInput, delaySeconds: 100 })
      ).rejects.toThrow(ValidationError);
    });

    it("throws ValidationError when maxMessagesPerSession is out of range", async () => {
      jest.mocked(companyService.assertOwnership).mockResolvedValue(undefined as any);

      await expect(
        agentService.createAgent("user-1", "company-1", { ...validCreateInput, maxMessagesPerSession: 600 })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("updateAgent", () => {
    it("updates agent with valid partial input", async () => {
      jest.mocked(agentRepository.findById).mockResolvedValue(mockAgent as any);
      jest.mocked(companyService.assertOwnership).mockResolvedValue(undefined as any);
      jest.mocked(agentRepository.update).mockResolvedValue({ ...mockAgent, name: "Updated" } as any);

      const result = await agentService.updateAgent("user-1", "agent-1", { name: "Updated" });

      expect(agentRepository.update).toHaveBeenCalledWith("agent-1", { name: "Updated" });
      expect(result.name).toBe("Updated");
    });

    it("throws NotFoundError when agent does not exist", async () => {
      jest.mocked(agentRepository.findById).mockResolvedValue(null);

      await expect(
        agentService.updateAgent("user-1", "nonexistent", { name: "X" })
      ).rejects.toThrow(NotFoundError);
    });

    it("throws ValidationError when updated name is empty", async () => {
      jest.mocked(agentRepository.findById).mockResolvedValue(mockAgent as any);
      jest.mocked(companyService.assertOwnership).mockResolvedValue(undefined as any);

      await expect(
        agentService.updateAgent("user-1", "agent-1", { name: "   " })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("toggleStatus", () => {
    it("toggles agent status", async () => {
      jest.mocked(agentRepository.findById).mockResolvedValue(mockAgent as any);
      jest.mocked(companyService.assertOwnership).mockResolvedValue(undefined as any);
      jest.mocked(agentRepository.toggleStatus).mockResolvedValue({ ...mockAgent, status: "paused" } as any);

      const result = await agentService.toggleStatus("user-1", "agent-1");
      expect(result.status).toBe("paused");
    });

    it("throws NotFoundError when agent does not exist", async () => {
      jest.mocked(agentRepository.findById).mockResolvedValue(null);

      await expect(agentService.toggleStatus("user-1", "nonexistent")).rejects.toThrow(NotFoundError);
    });
  });

  describe("deleteAgent", () => {
    it("deletes agent after ownership check", async () => {
      jest.mocked(agentRepository.findById).mockResolvedValue(mockAgent as any);
      jest.mocked(companyService.assertOwnership).mockResolvedValue(undefined as any);
      jest.mocked(agentRepository.delete).mockResolvedValue(undefined as any);

      await agentService.deleteAgent("user-1", "agent-1");

      expect(agentRepository.delete).toHaveBeenCalledWith("agent-1");
    });

    it("throws ForbiddenError when user does not own company", async () => {
      jest.mocked(agentRepository.findById).mockResolvedValue(mockAgent as any);
      jest.mocked(companyService.assertOwnership).mockRejectedValue(new ForbiddenError());

      await expect(agentService.deleteAgent("user-2", "agent-1")).rejects.toThrow(ForbiddenError);
    });
  });

  describe("getById", () => {
    it("returns agent when found", async () => {
      jest.mocked(agentRepository.findById).mockResolvedValue(mockAgent as any);
      const result = await agentService.getById("agent-1");
      expect(result).toEqual(mockAgent);
    });

    it("returns null when not found", async () => {
      jest.mocked(agentRepository.findById).mockResolvedValue(null);
      const result = await agentService.getById("nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("assertOwnership", () => {
    it("returns agent when ownership is confirmed", async () => {
      jest.mocked(agentRepository.findById).mockResolvedValue(mockAgent as any);
      jest.mocked(companyService.assertOwnership).mockResolvedValue(undefined as any);

      const result = await agentService.assertOwnership("user-1", "agent-1");
      expect(result).toEqual(mockAgent);
    });

    it("throws NotFoundError when agent does not exist", async () => {
      jest.mocked(agentRepository.findById).mockResolvedValue(null);

      await expect(agentService.assertOwnership("user-1", "nonexistent")).rejects.toThrow(NotFoundError);
    });
  });
});
