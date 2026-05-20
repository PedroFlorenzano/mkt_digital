/**
 * Unit tests for PostService.
 * All repository and external dependencies are mocked.
 */

import { postService } from "@server/services/post.service";
import { postRepository } from "@server/repositories/post.repository";
import { companyRepository } from "@server/repositories/company.repository";
import { NotFoundError, ForbiddenError, ValidationError } from "@server/lib/errors";

// Mock repositories
jest.mock("@server/repositories/post.repository");
jest.mock("@server/repositories/company.repository");
jest.mock("@server/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const mockCompany = {
  id: "company-1",
  userId: "user-1",
  name: "Test Company",
  description: null,
  sector: null,
  objective: null,
  tone: "professional",
  logoUrl: null,
  colors: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockPost = {
  id: "post-1",
  companyId: "company-1",
  platform: "instagram",
  content: "Test content",
  imageUrl: null,
  status: "draft",
  scheduledAt: null,
  publishedAt: null,
  createdAt: new Date(),
  format: "post",
  slidesJson: null,
  boostSuggestionJson: null,
  boostCampaignId: null,
  gridOrder: null,
};

describe("PostService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("listByUser", () => {
    it("throws NotFoundError when company does not exist", async () => {
      jest.mocked(companyRepository.findByUserId).mockResolvedValue(null);

      await expect(postService.listByUser("user-1")).rejects.toThrow(NotFoundError);
    });

    it("returns paginated posts for valid user", async () => {
      jest.mocked(companyRepository.findByUserId).mockResolvedValue(mockCompany);
      jest.mocked(postRepository.findByCompanyId).mockResolvedValue([mockPost]);
      jest.mocked(postRepository.countByCompanyId).mockResolvedValue(1);

      const result = await postService.listByUser("user-1");

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.hasNextPage).toBe(false);
    });
  });

  describe("create", () => {
    it("throws ValidationError for invalid platform", async () => {
      jest.mocked(companyRepository.findByUserId).mockResolvedValue(mockCompany);

      await expect(
        postService.create("user-1", { platform: "snapchat", content: "test" })
      ).rejects.toThrow(ValidationError);
    });

    it("throws ValidationError when no content or image", async () => {
      jest.mocked(companyRepository.findByUserId).mockResolvedValue(mockCompany);

      await expect(
        postService.create("user-1", { platform: "instagram" })
      ).rejects.toThrow(ValidationError);
    });

    it("throws NotFoundError when company does not exist", async () => {
      jest.mocked(companyRepository.findByUserId).mockResolvedValue(null);

      await expect(
        postService.create("user-1", { platform: "instagram", content: "test" })
      ).rejects.toThrow(NotFoundError);
    });

    it("creates post with correct data (round-trip property)", async () => {
      const input = { platform: "instagram" as const, content: "Hello world" };
      const expectedPost = { ...mockPost, content: input.content, platform: input.platform };

      jest.mocked(companyRepository.findByUserId).mockResolvedValue(mockCompany);
      jest.mocked(postRepository.create).mockResolvedValue(expectedPost);

      const post = await postService.create("user-1", input);

      expect(post.platform).toBe(input.platform);
      expect(post.content).toBe(input.content);
    });

    it("sets status to scheduled when scheduledAt is provided", async () => {
      const scheduledPost = { ...mockPost, status: "scheduled", scheduledAt: new Date() };
      jest.mocked(companyRepository.findByUserId).mockResolvedValue(mockCompany);
      jest.mocked(postRepository.create).mockResolvedValue(scheduledPost);

      const post = await postService.create("user-1", {
        platform: "instagram",
        content: "test",
        scheduledAt: new Date().toISOString(),
      });

      expect(post.status).toBe("scheduled");
    });
  });

  describe("delete", () => {
    it("throws NotFoundError when post does not exist", async () => {
      jest.mocked(companyRepository.findByUserId).mockResolvedValue(mockCompany);
      jest.mocked(postRepository.findById).mockResolvedValue(null);

      await expect(postService.delete("user-1", "post-999")).rejects.toThrow(NotFoundError);
    });

    it("throws ForbiddenError when post belongs to different company", async () => {
      jest.mocked(companyRepository.findByUserId).mockResolvedValue(mockCompany);
      jest.mocked(postRepository.findById).mockResolvedValue({
        ...mockPost,
        companyId: "other-company",
      });

      await expect(postService.delete("user-1", "post-1")).rejects.toThrow(ForbiddenError);
    });

    it("deletes post successfully", async () => {
      jest.mocked(companyRepository.findByUserId).mockResolvedValue(mockCompany);
      jest.mocked(postRepository.findById).mockResolvedValue(mockPost);
      jest.mocked(postRepository.delete).mockResolvedValue(mockPost);

      await expect(postService.delete("user-1", "post-1")).resolves.not.toThrow();
      expect(postRepository.delete).toHaveBeenCalledWith("post-1");
    });
  });

  describe("createForCompany — reel validations", () => {
    it("accepts tiktok as a valid platform", async () => {
      const reelPost = { ...mockPost, platform: "tiktok", format: "reel", imageUrl: "/uploads/vid.mp4" };
      jest.mocked(postRepository.create).mockResolvedValue(reelPost);

      await expect(
        postService.createForCompany("company-1", {
          platform: "tiktok",
          content: "My reel caption",
          imageUrl: "/uploads/vid.mp4",
          format: "reel",
        })
      ).resolves.not.toThrow();
    });

    it("accepts youtube as a valid platform", async () => {
      const reelPost = { ...mockPost, platform: "youtube", format: "reel", imageUrl: "/uploads/vid.mp4" };
      jest.mocked(postRepository.create).mockResolvedValue(reelPost);

      await expect(
        postService.createForCompany("company-1", {
          platform: "youtube",
          content: "My reel caption",
          imageUrl: "/uploads/vid.mp4",
          format: "reel",
        })
      ).resolves.not.toThrow();
    });

    it("rejects reel without imageUrl", async () => {
      await expect(
        postService.createForCompany("company-1", {
          platform: "instagram",
          content: "My caption",
          format: "reel",
        })
      ).rejects.toThrow(ValidationError);
    });

    it("rejects reel with empty imageUrl", async () => {
      await expect(
        postService.createForCompany("company-1", {
          platform: "instagram",
          content: "My caption",
          imageUrl: "   ",
          format: "reel",
        })
      ).rejects.toThrow(ValidationError);
    });

    it("rejects reel with null content", async () => {
      await expect(
        postService.createForCompany("company-1", {
          platform: "instagram",
          content: null,
          imageUrl: "/uploads/vid.mp4",
          format: "reel",
        })
      ).rejects.toThrow(ValidationError);
    });

    it("rejects reel with whitespace-only content", async () => {
      await expect(
        postService.createForCompany("company-1", {
          platform: "instagram",
          content: "   ",
          imageUrl: "/uploads/vid.mp4",
          format: "reel",
        })
      ).rejects.toThrow(ValidationError);
    });

    it("rejects invalid platform even for reels", async () => {
      await expect(
        postService.createForCompany("company-1", {
          platform: "pinterest",
          content: "My caption",
          imageUrl: "/uploads/vid.mp4",
          format: "reel",
        })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe("createForCompany — scheduledAt handling", () => {
    it("creates as scheduled when scheduledAt is strictly in the future", async () => {
      const future = new Date(Date.now() + 60_000).toISOString();
      const scheduledPost = { ...mockPost, status: "scheduled", scheduledAt: new Date(future) };
      jest.mocked(postRepository.create).mockResolvedValue(scheduledPost);

      const post = await postService.createForCompany("company-1", {
        platform: "instagram",
        content: "test",
        scheduledAt: future,
      });

      expect(post.status).toBe("scheduled");
    });

    it("creates as draft when scheduledAt is in the past", async () => {
      const past = new Date(Date.now() - 60_000).toISOString();
      const draftPost = { ...mockPost, status: "draft", scheduledAt: null };
      jest.mocked(postRepository.create).mockResolvedValue(draftPost);

      const post = await postService.createForCompany("company-1", {
        platform: "instagram",
        content: "test",
        scheduledAt: past,
      });

      // repository.create should be called with status=draft and scheduledAt=null
      expect(postRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: "draft", scheduledAt: null })
      );
      expect(post.status).toBe("draft");
    });

    it("rejects invalid ISO string for scheduledAt", async () => {
      await expect(
        postService.createForCompany("company-1", {
          platform: "instagram",
          content: "test",
          scheduledAt: "not-a-date",
        })
      ).rejects.toThrow(ValidationError);
    });

    it("creates as draft when scheduledAt is null", async () => {
      const draftPost = { ...mockPost, status: "draft", scheduledAt: null };
      jest.mocked(postRepository.create).mockResolvedValue(draftPost);

      const post = await postService.createForCompany("company-1", {
        platform: "instagram",
        content: "test",
        scheduledAt: null,
      });

      expect(post.status).toBe("draft");
    });
  });

  describe("listByCompanyId — format filter", () => {
    it("passes format filter to repository when provided", async () => {
      jest.mocked(postRepository.findByCompanyId).mockResolvedValue([]);
      jest.mocked(postRepository.countByCompanyId).mockResolvedValue(0);

      await postService.listByCompanyId("company-1", { format: "reel" });

      expect(postRepository.findByCompanyId).toHaveBeenCalledWith(
        "company-1",
        expect.objectContaining({ format: "reel" })
      );
      expect(postRepository.countByCompanyId).toHaveBeenCalledWith(
        "company-1",
        expect.objectContaining({ format: "reel" })
      );
    });

    it("does not pass format filter when omitted", async () => {
      jest.mocked(postRepository.findByCompanyId).mockResolvedValue([]);
      jest.mocked(postRepository.countByCompanyId).mockResolvedValue(0);

      await postService.listByCompanyId("company-1");

      expect(postRepository.findByCompanyId).toHaveBeenCalledWith(
        "company-1",
        expect.objectContaining({ format: undefined })
      );
    });
  });
});
