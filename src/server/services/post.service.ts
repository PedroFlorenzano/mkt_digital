import { postRepository, type CreatePostData } from "@server/repositories/post.repository";
import { companyRepository } from "@server/repositories/company.repository";
import { NotFoundError, ForbiddenError, ValidationError } from "@server/lib/errors";
import { logger } from "@server/lib/logger";
import type { Post } from "@prisma/client";

const VALID_PLATFORMS = ["instagram", "facebook", "linkedin", "whatsapp"] as const;
type Platform = (typeof VALID_PLATFORMS)[number];

function isValidPlatform(p: string): p is Platform {
  return (VALID_PLATFORMS as readonly string[]).includes(p);
}

export const postService = {
  async listByUser(
    userId: string,
    options: { page?: number; pageSize?: number } = {},
  ): Promise<{ data: Post[]; total: number; page: number; pageSize: number; hasNextPage: boolean }> {
    const company = await companyRepository.findByUserId(userId);
    if (!company) throw new NotFoundError("Company");

    const page = Math.max(1, options.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 20));
    const skip = (page - 1) * pageSize;

    const [data, total] = await Promise.all([
      postRepository.findByCompanyId(company.id, { take: pageSize, skip }),
      postRepository.countByCompanyId(company.id),
    ]);

    return { data, total, page, pageSize, hasNextPage: skip + data.length < total };
  },

  async create(
    userId: string,
    input: {
      platform: string;
      content?: string | null;
      imageUrl?: string | null;
      scheduledAt?: string | null;
      textVariants?: Array<{ title: string; content: string }>;
      imageVariants?: string[];
      selectedTextIndex?: number | null;
      selectedImageIndex?: number | null;
    },
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

    const post = await postRepository.create({
      companyId: company.id,
      platform: input.platform,
      content: input.content ?? null,
      imageUrl: input.imageUrl ?? null,
      status: scheduledAt ? "scheduled" : "draft",
      scheduledAt,
      variants,
    });

    logger.info("[post] Created", { postId: post.id, platform: post.platform, userId });
    return post;
  },

  async delete(userId: string, postId: string): Promise<void> {
    const company = await companyRepository.findByUserId(userId);
    if (!company) throw new NotFoundError("Company");

    const post = await postRepository.findById(postId);
    if (!post) throw new NotFoundError("Post");
    if (post.companyId !== company.id) throw new ForbiddenError();

    await postRepository.delete(postId);
    logger.info("[post] Deleted", { postId, userId });
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
