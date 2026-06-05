import { conversationService } from "@server/services/conversation.service";
import { conversationRepository } from "@server/repositories/conversation.repository";

jest.mock("@server/repositories/conversation.repository");

const mockMessage = {
  id: "msg-1",
  agentId: "agent-1",
  remoteJid: "5511999990000@s.whatsapp.net",
  role: "user",
  content: "Hello",
  createdAt: new Date("2026-01-01T10:00:00Z"),
};

describe("ConversationService", () => {
  beforeEach(() => jest.clearAllMocks());

  describe("saveMessage", () => {
    it("delegates to repository and returns created message", async () => {
      jest.mocked(conversationRepository.save).mockResolvedValue(mockMessage as any);

      const input = {
        agentId: "agent-1",
        remoteJid: "5511999990000@s.whatsapp.net",
        role: "user" as const,
        content: "Hello",
      };

      const result = await conversationService.saveMessage(input);

      expect(conversationRepository.save).toHaveBeenCalledWith(input);
      expect(result).toEqual(mockMessage);
    });
  });

  describe("getHistory", () => {
    it("returns messages for a conversation", async () => {
      const messages = [mockMessage, { ...mockMessage, id: "msg-2", role: "assistant", content: "Hi!" }];
      jest.mocked(conversationRepository.getHistory).mockResolvedValue(messages as any);

      const result = await conversationService.getHistory("agent-1", "5511999990000@s.whatsapp.net");

      expect(conversationRepository.getHistory).toHaveBeenCalledWith("agent-1", "5511999990000@s.whatsapp.net");
      expect(result).toHaveLength(2);
    });

    it("returns empty array when no messages exist", async () => {
      jest.mocked(conversationRepository.getHistory).mockResolvedValue([]);

      const result = await conversationService.getHistory("agent-1", "unknown@s.whatsapp.net");
      expect(result).toEqual([]);
    });
  });

  describe("listConversations", () => {
    it("delegates pagination to repository", async () => {
      const summaries = [{
        remoteJid: "5511999990000@s.whatsapp.net",
        contactName: "John",
        lastMessageAt: new Date(),
        messageCount: 5,
      }];
      jest.mocked(conversationRepository.listConversations).mockResolvedValue(summaries as any);

      const result = await conversationService.listConversations("agent-1", 2, 10);

      expect(conversationRepository.listConversations).toHaveBeenCalledWith("agent-1", 2, 10);
      expect(result).toEqual(summaries);
    });

    it("uses default pagination values", async () => {
      jest.mocked(conversationRepository.listConversations).mockResolvedValue([]);

      await conversationService.listConversations("agent-1");

      expect(conversationRepository.listConversations).toHaveBeenCalledWith("agent-1", 1, 20);
    });
  });

  describe("countTodayMessages", () => {
    it("returns count from repository", async () => {
      jest.mocked(conversationRepository.countTodayMessages).mockResolvedValue(15);

      const result = await conversationService.countTodayMessages("agent-1", "5511999990000@s.whatsapp.net");

      expect(conversationRepository.countTodayMessages).toHaveBeenCalledWith("agent-1", "5511999990000@s.whatsapp.net");
      expect(result).toBe(15);
    });
  });
});
