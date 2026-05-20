import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@server/lib/auth";
import { prisma } from "@server/lib/prisma";
import { companyService } from "@server/services/company.service";
import {
  publishToInstagram,
  publishToFacebook,
  publishToLinkedin,
  publishToWhatsapp,
  publishCarouselToInstagram,
  publishReelToInstagram,
  publishStoryToInstagram,
  publishVideoToTikTok,
  publishPhotoToTikTok,
} from "@server/lib/social";
import { validateReelPublish } from "@server/services/reel.service";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const userId = session.user.id;
  const activeCompanyId = session.user.activeCompanyId;
  if (!activeCompanyId) {
    return NextResponse.json({ error: "Nenhuma empresa selecionada" }, { status: 401 });
  }

  let company;
  try {
    company = await companyService.assertOwnership(userId, activeCompanyId);
  } catch {
    return NextResponse.json({ error: "Empresa não configurada" }, { status: 400 });
  }

  // Re-fetch with socialAccounts included
  const companyWithSocial = await prisma.company.findUnique({
    where: { id: company.id },
    include: { socialAccounts: true },
  });

  if (!companyWithSocial) {
    return NextResponse.json({ error: "Empresa não configurada" }, { status: 400 });
  }

  const body = await request.json();
  const { postId } = body;

  if (!postId) {
    return NextResponse.json({ error: "Post ID é obrigatório" }, { status: 400 });
  }

  const post = await prisma.post.findFirst({
    where: { id: postId, companyId: companyWithSocial.id },
  });

  if (!post) {
    return NextResponse.json({ error: "Post não encontrado" }, { status: 404 });
  }

  const account = companyWithSocial.socialAccounts.find(
    (a) => a.platform === post.platform && a.connected && a.accessToken
  );

  if (!account || !account.accessToken) {
    return NextResponse.json(
      { error: `Conta ${post.platform} não conectada` },
      { status: 400 }
    );
  }

  let result;

  switch (post.platform) {
    case "instagram": {
      const format = post.format ?? "post";

      if (format === "carousel") {
        // Parse slidesJson for image URLs; fall back to standard post if missing/invalid
        let imageUrls: string[] = [];
        if (post.slidesJson) {
          try {
            const slides = JSON.parse(post.slidesJson) as Array<{ imageUrl?: string; url?: string }>;
            imageUrls = slides
              .map((s) => s.imageUrl ?? s.url ?? "")
              .filter(Boolean);
          } catch {
            // malformed JSON — fall through to default
          }
        }

        if (imageUrls.length > 0) {
          result = await publishCarouselToInstagram(
            account.accessToken,
            account.profileId || "",
            post.content ?? "",
            imageUrls
          );
        } else {
          // No valid slides — fall back to standard photo post
          result = await publishToInstagram(
            account.accessToken,
            account.profileId || "",
            post.content ?? "",
            post.imageUrl
          );
        }
      } else if (format === "reel") {
        const videoUrl = post.imageUrl ?? "";
        try {
          validateReelPublish({
            videoUrl,
            durationSeconds: 30, // placeholder; real validation happens at upload time
            platform: "instagram",
            socialAccountConnected: account.connected,
          });
        } catch (err) {
          return NextResponse.json(
            { error: err instanceof Error ? err.message : "Validação do Reel falhou" },
            { status: 400 }
          );
        }
        result = await publishReelToInstagram(
          account.accessToken,
          account.profileId || "",
          post.content ?? "",
          videoUrl
        );
      } else if (format === "story") {
        const mediaUrl = post.imageUrl ?? "";
        const videoExtensions = [".mp4", ".mov", ".avi"];
        const isVideo = videoExtensions.some((ext) =>
          mediaUrl.toLowerCase().endsWith(ext)
        );
        const mediaType: "IMAGE" | "VIDEO" = isVideo ? "VIDEO" : "IMAGE";
        result = await publishStoryToInstagram(
          account.accessToken,
          account.profileId || "",
          mediaUrl,
          mediaType
        );
      } else {
        // Default: standard "post" format
        result = await publishToInstagram(
          account.accessToken,
          account.profileId || "",
          post.content ?? "",
          post.imageUrl
        );
      }
      break;
    }
    case "facebook":
      result = await publishToFacebook(
        account.accessToken,
        account.profileId || "",
        post.content || "",
        post.imageUrl
      );
      break;
    case "linkedin":
      result = await publishToLinkedin(
        account.accessToken,
        account.profileId || "",
        post.content || "",
        post.imageUrl
      );
      break;
    case "whatsapp":
      result = await publishToWhatsapp(
        account.accessToken,
        account.profileId || "",
        post.content || "",
        post.imageUrl
      );
      break;
    case "tiktok": {
      const format = post.format ?? "post";

      if (format === "reel" || format === "post") {
        // Video post: imageUrl stores the public video URL for TikTok
        const videoUrl = post.imageUrl ?? "";
        if (!videoUrl) {
          result = { success: false, error: "URL do vídeo é obrigatória para posts de vídeo no TikTok" };
        } else {
          result = await publishVideoToTikTok(
            account.accessToken,
            post.content ?? "",
            videoUrl,
          );
        }
      } else if (format === "carousel") {
        // Photo carousel post
        let imageUrls: string[] = [];
        if (post.slidesJson) {
          try {
            const slides = JSON.parse(post.slidesJson) as Array<{ imageUrl?: string }>;
            imageUrls = slides.map((s) => s.imageUrl ?? "").filter(Boolean);
          } catch {
            // malformed JSON
          }
        }
        if (imageUrls.length === 0 && post.imageUrl) {
          imageUrls = [post.imageUrl];
        }
        result = await publishPhotoToTikTok(
          account.accessToken,
          post.content ?? "",
          imageUrls,
        );
      } else {
        // Default: treat as video post
        result = await publishVideoToTikTok(
          account.accessToken,
          post.content ?? "",
          post.imageUrl ?? "",
        );
      }
      break;
    }
    default:
      return NextResponse.json({ error: "Plataforma não suportada" }, { status: 400 });
  }

  if (result.success) {
    await prisma.post.update({
      where: { id: postId },
      data: { status: "published", publishedAt: new Date() },
    });
  }

  return NextResponse.json(result);
}
