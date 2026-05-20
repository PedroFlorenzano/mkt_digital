import { prisma } from "@server/lib/prisma";
import type { Post, PostVariant } from "@prisma/client";

export type PostWithVariants = Post & { variants: PostVariant[] };

export interface CreatePostData {
  companyId: string;
  platform: string;
  content?: string | null;
  imageUrl?: string | null;
  status?: string;
  scheduledAt?: Date | null;
  format?: string;
  variants?: Array<{
    type: string;
    content?: string | null;
    mediaUrl?: string | null;
    selected: boolean;
  }>;
}

export const postRepository = {
  findByCompanyId(
    companyId: string,
    options: { take?: number; skip?: number; format?: string } = {},
  ): Promise<Post[]> {
    return prisma.post.findMany({
      where: {
        companyId,
        ...(options.format !== undefined ? { format: options.format } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: options.take ?? 50,
      skip: options.skip ?? 0,
    });
  },

  findById(id: string): Promise<Post | null> {
    return prisma.post.findUnique({ where: { id } });
  },

  findByIdWithVariants(id: string): Promise<PostWithVariants | null> {
    return prisma.post.findUnique({
      where: { id },
      include: { variants: true },
    });
  },

  findScheduledBefore(date: Date): Promise<Post[]> {
    return prisma.post.findMany({
      where: {
        status: "scheduled",
        scheduledAt: { lte: date },
      },
      take: 100,
    });
  },

  create(data: CreatePostData): Promise<Post> {
    const { variants, ...postData } = data;
    return prisma.post.create({
      data: {
        ...postData,
        ...(variants && variants.length > 0
          ? { variants: { create: variants } }
          : {}),
      },
    });
  },

  updateStatus(
    id: string,
    status: string,
    publishedAt?: Date,
  ): Promise<Post> {
    return prisma.post.update({
      where: { id },
      data: { status, ...(publishedAt ? { publishedAt } : {}) },
    });
  },

  schedule(id: string, scheduledAt: Date): Promise<Post> {
    return prisma.post.update({
      where: { id },
      data: { status: "scheduled", scheduledAt },
    });
  },

  delete(id: string): Promise<Post> {
    return prisma.post.delete({ where: { id } });
  },

  countByCompanyId(companyId: string, options: { format?: string } = {}): Promise<number> {
    return prisma.post.count({
      where: {
        companyId,
        ...(options.format !== undefined ? { format: options.format } : {}),
      },
    });
  },
};
