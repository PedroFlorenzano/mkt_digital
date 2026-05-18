import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@server/lib/auth";
import { prisma } from "@server/lib/prisma";
import { companyService } from "@server/services/company.service";
import { withErrorHandler } from "@server/lib/api-handler";
import { UnauthorizedError, NotFoundError, ForbiddenError } from "@server/lib/errors";

// PATCH /api/posts/[id] — edit a post's content and/or imageUrl
export const PATCH = withErrorHandler(async (request: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new UnauthorizedError();

  const userId = session.user.id;
  const activeCompanyId = session.user.activeCompanyId;
  if (!activeCompanyId) throw new UnauthorizedError("Nenhuma empresa selecionada");

  // Extract [id] from URL — /api/posts/[id]
  const postId = new URL(request.url).pathname.split("/").pop();
  if (!postId) throw new NotFoundError("Post");

  const company = await companyService.assertOwnership(userId, activeCompanyId);

  // Verify post belongs to this company
  const post = await prisma.post.findFirst({
    where: { id: postId, companyId: company.id },
  });
  if (!post) throw new ForbiddenError("Post não encontrado ou sem acesso");

  const body = await request.json() as Record<string, unknown>;
  const updates: { content?: string | null; imageUrl?: string | null } = {};

  if ("content" in body) {
    updates.content = typeof body["content"] === "string" ? body["content"] : null;
  }
  if ("imageUrl" in body) {
    updates.imageUrl = typeof body["imageUrl"] === "string" ? body["imageUrl"] : null;
  }

  const updated = await prisma.post.update({
    where: { id: postId },
    data: updates,
  });

  return NextResponse.json(updated);
});
