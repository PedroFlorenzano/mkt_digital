import { NextResponse } from "next/server";
import { prisma } from "@server/lib/prisma";
import {
  publishToInstagram,
  publishToFacebook,
  publishToLinkedin,
  publishToWhatsapp,
} from "@server/lib/social";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const now = new Date();
  const posts = await prisma.post.findMany({
    where: {
      status: "scheduled",
      scheduledAt: { lte: now },
    },
    include: {
      company: {
        include: { socialAccounts: true },
      },
    },
    take: 50,
  });

  const results = [];

  for (const post of posts) {
    const account = post.company.socialAccounts.find(
      (a) => a.platform === post.platform && a.connected && a.accessToken
    );

    if (!account || !account.accessToken) {
      await prisma.post.update({
        where: { id: post.id },
        data: { status: "failed" },
      });
      results.push({ postId: post.id, success: false, error: "Conta não conectada" });
      continue;
    }

    let result;

    switch (post.platform) {
      case "instagram":
        result = await publishToInstagram(
          account.accessToken,
          account.profileId || "",
          post.content || "",
          post.imageUrl
        );
        break;
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
      default:
        result = { success: false, error: "Plataforma não suportada" };
    }

    await prisma.post.update({
      where: { id: post.id },
      data: {
        status: result.success ? "published" : "failed",
        publishedAt: result.success ? now : null,
      },
    });

    results.push({ postId: post.id, ...result });
  }

  return NextResponse.json({
    processed: results.length,
    results,
  });
}
