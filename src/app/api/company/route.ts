import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const userId = (session.user as { id: string }).id;
  const body = await request.json();
  const { name, description, sector, objective, tone, colors } = body;

  if (!name) {
    return NextResponse.json(
      { error: "Nome da empresa é obrigatório" },
      { status: 400 }
    );
  }

  const colorsStr = Array.isArray(colors) ? JSON.stringify(colors) : colors;

  const company = await prisma.company.upsert({
    where: { userId },
    update: { name, description, sector, objective, tone, colors: colorsStr },
    create: { userId, name, description, sector, objective, tone, colors: colorsStr },
  });

  return NextResponse.json({
    ...company,
    colors: parseColors(company.colors),
  });
}

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const userId = (session.user as { id: string }).id;

  const company = await prisma.company.findUnique({
    where: { userId },
    include: { socialAccounts: true },
  });

  if (!company) {
    return NextResponse.json(null);
  }

  return NextResponse.json({
    ...company,
    colors: parseColors(company.colors),
  });
}

function parseColors(colors: string | null): string[] {
  if (!colors) return [];
  try {
    const parsed = JSON.parse(colors);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
