import { prisma } from "@server/lib/prisma";
import { NotFoundError, ForbiddenError, ValidationError } from "@server/lib/errors";

export interface FeedGridItem {
  id: string;
  imageUrl: string | null;
  content: string | null;
  status: string; // "published" | "scheduled" | "draft"
  platform: string;
  publishedAt: Date | null;
  scheduledAt: Date | null;
  gridOrder: number | null;
  format: string | null;
  createdAt: Date;
}

/**
 * Returns all Instagram posts for a company (published, scheduled, draft),
 * sorted with published posts first (by publishedAt DESC), then unscheduled/draft
 * posts by gridOrder ASC NULLS LAST, scheduledAt ASC NULLS LAST, createdAt ASC.
 */
export async function getFeedGrid(companyId: string): Promise<FeedGridItem[]> {
  const posts = await prisma.post.findMany({
    where: {
      companyId,
      platform: "instagram",
      status: { in: ["published", "scheduled", "draft"] },
    },
    select: {
      id: true,
      imageUrl: true,
      content: true,
      status: true,
      platform: true,
      publishedAt: true,
      scheduledAt: true,
      gridOrder: true,
      format: true,
      createdAt: true,
    },
  });

  // Sort: published by publishedAt DESC, then non-published by gridOrder ASC NULLS LAST,
  // scheduledAt ASC NULLS LAST, createdAt ASC
  posts.sort((a, b) => {
    const aPublished = a.status === "published";
    const bPublished = b.status === "published";

    if (aPublished && bPublished) {
      // Both published: sort by publishedAt DESC
      const aTime = a.publishedAt?.getTime() ?? 0;
      const bTime = b.publishedAt?.getTime() ?? 0;
      return bTime - aTime;
    }

    if (aPublished) return -1; // published comes before non-published
    if (bPublished) return 1;

    // Both non-published: gridOrder ASC NULLS LAST
    if (a.gridOrder !== null && b.gridOrder !== null) {
      if (a.gridOrder !== b.gridOrder) return a.gridOrder - b.gridOrder;
    } else if (a.gridOrder !== null) {
      return -1;
    } else if (b.gridOrder !== null) {
      return 1;
    }

    // Then scheduledAt ASC NULLS LAST
    if (a.scheduledAt !== null && b.scheduledAt !== null) {
      const diff = a.scheduledAt.getTime() - b.scheduledAt.getTime();
      if (diff !== 0) return diff;
    } else if (a.scheduledAt !== null) {
      return -1;
    } else if (b.scheduledAt !== null) {
      return 1;
    }

    // Then createdAt ASC
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  return posts;
}

/**
 * Updates the gridOrder of a non-published post.
 * Throws NotFoundError if the post doesn't exist,
 * ForbiddenError if it belongs to a different company,
 * ValidationError if the post is already published.
 */
export async function reorderGrid(
  companyId: string,
  postId: string,
  newGridOrder: number,
): Promise<void> {
  const post = await prisma.post.findUnique({ where: { id: postId } });

  if (!post) throw new NotFoundError("Post");
  if (post.companyId !== companyId) throw new ForbiddenError();
  if (post.status === "published") {
    throw new ValidationError("Published posts cannot be reordered");
  }

  await prisma.post.update({
    where: { id: postId },
    data: { gridOrder: newGridOrder },
  });
}
