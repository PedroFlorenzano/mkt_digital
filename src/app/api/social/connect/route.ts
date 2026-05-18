import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@server/lib/auth";
import { prisma } from "@server/lib/prisma";
import { companyService } from "@server/services/company.service";

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

  const body = await request.json();
  const { platform, accessToken, refreshToken, profileId, profileName } = body;

  if (!platform || !accessToken) {
    return NextResponse.json(
      { error: "Plataforma e token são obrigatórios" },
      { status: 400 }
    );
  }

  const account = await prisma.socialAccount.upsert({
    where: {
      companyId_platform: {
        companyId: company.id,
        platform,
      },
    },
    update: {
      accessToken,
      refreshToken,
      profileId,
      profileName,
      connected: true,
    },
    create: {
      companyId: company.id,
      platform,
      accessToken,
      refreshToken,
      profileId,
      profileName,
      connected: true,
    },
  });

  return NextResponse.json({
    id: account.id,
    platform: account.platform,
    profileName: account.profileName,
    connected: account.connected,
    updatedAt: account.updatedAt?.toISOString?.() ?? undefined,
  });
}

export async function DELETE(request: Request) {
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

  const { searchParams } = new URL(request.url);
  const platform = searchParams.get("platform");

  if (!platform) {
    return NextResponse.json({ error: "Plataforma é obrigatória" }, { status: 400 });
  }

  await prisma.socialAccount.updateMany({
    where: { companyId: company.id, platform },
    data: { connected: false, accessToken: null, refreshToken: null },
  });

  return NextResponse.json({ success: true });
}
