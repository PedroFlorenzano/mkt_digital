import { postRepository } from "@server/repositories/post.repository";
import { NotFoundError, ForbiddenError, ValidationError } from "@server/lib/errors";

export interface FeedGridItem {
  id: string;
  imageUrl: string | null;
  content: string | null;
  status: string;
  platform: string;
  publishedAt: Date | null;
  scheduledAt: Date | null;
  gridOrder: number | null;
  format: string | null;
  createdAt: Date;
}

export async function getFeedGrid(companyId: string): Promise<FeedGridItem[]> {
  const posts = await postRepository.findInstagramPosts(companyId, ["published", "scheduled", "draft"]);

  posts.sort((a, b) => {
    const aPublished = a.status === "published";
    const bPublished = b.status === "published";

    if (aPublished && bPublished) {
      const aTime = (a as { publishedAt?: Date | null }).publishedAt?.getTime?.() ?? 0;
      const bTime = (b as { publishedAt?: Date | null }).publishedAt?.getTime?.() ?? 0;
      return bTime - aTime;
    }

    if (aPublished) return -1;
    if (bPublished) return 1;

    if (a.gridOrder !== null && b.gridOrder !== null) {
      if (a.gridOrder !== b.gridOrder) return a.gridOrder - b.gridOrder;
    } else if (a.gridOrder !== null) {
      return -1;
    } else if (b.gridOrder !== null) {
      return 1;
    }

    if (a.scheduledAt !== null && b.scheduledAt !== null) {
      const diff = a.scheduledAt.getTime() - b.scheduledAt.getTime();
      if (diff !== 0) return diff;
    } else if (a.scheduledAt !== null) {
      return -1;
    } else if (b.scheduledAt !== null) {
      return 1;
    }

    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  return posts as FeedGridItem[];
}

export async function reorderGrid(
  companyId: string,
  postId: string,
  newGridOrder: number,
): Promise<void> {
  const post = await postRepository.findById(postId);

  if (!post) throw new NotFoundError("Post");
  if (post.companyId !== companyId) throw new ForbiddenError();
  if (post.status === "published") {
    throw new ValidationError("Published posts cannot be reordered");
  }

  await postRepository.updateGridOrder(postId, newGridOrder);
}
