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
} from "@server/lib/social";

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
