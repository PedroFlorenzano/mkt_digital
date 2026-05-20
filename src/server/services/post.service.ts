import { postRepository, type CreatePostData } from "@server/repositories/post.repository";
import { companyRepository } from "@server/repositories/company.repository";
import { NotFoundError, ForbiddenError, ValidationError } from "@server/lib/errors";
import { logger } from "@server/lib/logger";
import type { Post } from "@prisma/client";

const VALID_PLATFORMS = ["instagram", "facebook", "linkedin", "whatsapp", "tiktok", "youtube"] as const;
type Platform = (typeof VALID_PLATFORMS)[number];

function isValidPlatform(p: string): p is Platform {
  return (VALID_PLATFORMS as readonly string[]).includes(p);
}

type PostInput = {
  platform: string;
  content?: string | null;
  imageUrl?: string | null;
  scheduledAt?: string | null;
  format?: string;
  textVariants?: Array<{ title: string; content: string }>;
  imageVariants?: string[];
  selectedTextIndex?: number | null;
  selectedImageIndex?: number | null;
};

function buildVariants(input: PostInput): CreatePostData["variants"] {
  const variants: CreatePostData["variants"] = [];
  (input.textVariants ?? []).forEach((v, i) => {
    variants.push({
      type: "text",
      content: v.content,
      mediaUrl: null,
      selected: i === (input.selectedTextIndex ?? -1),
    });
  });
  (input.imageVariants ?? []).forEach((url, i) => {
    variants.push({
      type: "image",
      content: null,
      mediaUrl: url,
      selected: i === (input.selectedImageIndex ?? -1),
    });
  });
  return variants;
}

export const postService = {
  // ─────────────────────────────────────────────
  // New multi-company methods (use companyId directly)
  // ─────────────────────────────────────────────

  async listByCompanyId(
    companyId: string,
    options: { page?: number; pageSize?: number; format?: string } = {},
  ): Promise<{ data: Post[]; total: number; page: number; pageSize: number; hasNextPage: boolean }> {
    const page = Math.max(1, options.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 20));
    const skip = (page - 1) * pageSize;

    const [data, total] = await Promise.all([
      postRepository.findByCompanyId(companyId, { take: pageSize, skip, format: options.format }),
      postRepository.countByCompanyId(companyId, { format: options.format }),
    ]);

    return { data, total, page, pageSize, hasNextPage: skip + data.length < total };
  },

  async createForCompany(
    companyId: string,
    input: PostInput,
  ): Promise<Post> {
    if (!isValidPlatform(input.platform)) {
      throw new ValidationError(`Invalid platform. Use: ${VALID_PLATFORMS.join(", ")}`);
    }

    // Reel-specific validations
    if (input.format === "reel") {
      if (!input.imageUrl || input.imageUrl.trim() === "") {
        throw new ValidationError("imageUrl is required for reels");
      }
      if (!input.content || input.content.trim() === "") {
        throw new ValidationError("content is required for reels");
      }
    } else if (!input.content && !input.imageUrl) {
      throw new ValidationError("Post must have content or an image");
    }

    // scheduledAt validation: reject invalid ISO strings
    let scheduledAt: Date | null = null;
    if (input.scheduledAt != null) {
      const parsed = new Date(input.scheduledAt);
      if (isNaN(parsed.getTime())) {
        throw new ValidationError("Invalid scheduledAt date");
      }
      // If in the past, treat as draft (scheduledAt = null)
      if (parsed.getTime() > Date.now()) {
        scheduledAt = parsed;
      }
    }

    const post = await postRepository.create({
      companyId,
      platform: input.platform,
      content: input.content ?? null,
      imageUrl: input.imageUrl ?? null,
      status: scheduledAt ? "scheduled" : "draft",
      scheduledAt,
      format: input.format,
      variants: buildVariants(input),
    });

    logger.info("[post] Created", { postId: post.id, platform: post.platform, companyId });
    return post;
  },

  async deleteForCompany(companyId: string, postId: string): Promise<void> {
    const post = await postRepository.findById(postId);
    if (!post) throw new NotFoundError("Post");
    if (post.companyId !== companyId) throw new ForbiddenError();

    await postRepository.delete(postId);
    logger.info("[post] Deleted", { postId, companyId });
  },

  // ─────────────────────────────────────────────
  // Legacy methods — kept for backward compatibility
  // ─────────────────────────────────────────────

  /** @deprecated Use listByCompanyId with companyId from session.activeCompanyId */
  async listByUser(
    userId: string,
    options: { page?: number; pageSize?: number } = {},
  ): Promise<{ data: Post[]; total: number; page: number; pageSize: number; hasNextPage: boolean }> {
    const company = await companyRepository.findByUserId(userId);
    if (!company) throw new NotFoundError("Company");
    return this.listByCompanyId(company.id, options);
  },

  /** @deprecated Use createForCompany with companyId from session.activeCompanyId */
  async create(
    userId: string,
    input: PostInput,
  ): Promise<Post> {
    if (!isValidPlatform(input.platform)) {
      throw new ValidationError(`Invalid platform. Use: ${VALID_PLATFORMS.join(", ")}`);
    }
    if (!input.content && !input.imageUrl) {
      throw new ValidationError("Post must have content or an image");
    }

    const company = await companyRepository.findByUserId(userId);
    if (!company) throw new NotFoundError("Company");

    const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
    if (scheduledAt && isNaN(scheduledAt.getTime())) {
      throw new ValidationError("Invalid scheduledAt date");
    }

    const post = await postRepository.create({
      companyId: company.id,
      platform: input.platform,
      content: input.content ?? null,
      imageUrl: input.imageUrl ?? null,
      status: scheduledAt ? "scheduled" : "draft",
      scheduledAt,
      variants: buildVariants(input),
    });

    logger.info("[post] Created", { postId: post.id, platform: post.platform, userId });
    return post;
  },

  /** @deprecated Use deleteForCompany with companyId from session.activeCompanyId */
  async delete(userId: string, postId: string): Promise<void> {
    const company = await companyRepository.findByUserId(userId);
    if (!company) throw new NotFoundError("Company");
    return this.deleteForCompany(company.id, postId);
  },

  async schedule(
    userId: string,
    postId: string,
    scheduledAt: Date,
  ): Promise<Post> {
    const company = await companyRepository.findByUserId(userId);
    if (!company) throw new NotFoundError("Company");

    const post = await postRepository.findById(postId);
    if (!post) throw new NotFoundError("Post");
    if (post.companyId !== company.id) throw new ForbiddenError();

    const updated = await postRepository.schedule(postId, scheduledAt);
    logger.info("[post] Scheduled", { postId, scheduledAt, userId });
    return updated;
  },
};
