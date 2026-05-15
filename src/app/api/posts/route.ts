import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@server/lib/auth";
import { postService } from "@server/services/post.service";
import { withErrorHandler } from "@server/lib/api-handler";
import { UnauthorizedError } from "@server/lib/errors";

export const GET = withErrorHandler(async (request: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new UnauthorizedError();

  const userId = (session.user as { id: string }).id;
  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const pageSize = parseInt(searchParams.get("pageSize") ?? "20", 10);

  const result = await postService.listByUser(userId, { page, pageSize });
  return NextResponse.json(result.data);
});

export const POST = withErrorHandler(async (request: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new UnauthorizedError();

  const userId = (session.user as { id: string }).id;
  const body = await request.json() as Record<string, unknown>;

  const post = await postService.create(userId, {
    platform: typeof body["platform"] === "string" ? body["platform"] : "",
    content: typeof body["content"] === "string" ? body["content"] : null,
    imageUrl: typeof body["imageUrl"] === "string" ? body["imageUrl"] : null,
    scheduledAt: typeof body["scheduledAt"] === "string" ? body["scheduledAt"] : null,
    textVariants: Array.isArray(body["textVariants"])
      ? (body["textVariants"] as Array<{ title: string; content: string }>)
      : [],
    imageVariants: Array.isArray(body["imageVariants"])
      ? (body["imageVariants"] as string[])
      : [],
    selectedTextIndex: typeof body["selectedTextIndex"] === "number" ? body["selectedTextIndex"] : null,
    selectedImageIndex: typeof body["selectedImageIndex"] === "number" ? body["selectedImageIndex"] : null,
  });

  return NextResponse.json(post);
});

export const DELETE = withErrorHandler(async (request: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new UnauthorizedError();

  const userId = (session.user as { id: string }).id;
  const { searchParams } = new URL(request.url);
  const postId = searchParams.get("id");

  if (!postId) {
    return NextResponse.json({ error: "Post ID is required" }, { status: 400 });
  }

  await postService.delete(userId, postId);
  return NextResponse.json({ success: true });
});
