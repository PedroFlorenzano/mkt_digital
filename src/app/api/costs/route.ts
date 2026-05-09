import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const userId = (session.user as { id: string }).id;
  const company = await prisma.company.findUnique({ where: { userId } });

  if (!company) {
    return NextResponse.json({ error: "Empresa não configurada" }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const period = searchParams.get("period") || "month";

  let startDate: Date;
  const now = new Date();

  switch (period) {
    case "week":
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case "month":
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case "year":
      startDate = new Date(now.getFullYear(), 0, 1);
      break;
    case "all":
      startDate = new Date(0);
      break;
    default:
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  const logs = await prisma.costLog.findMany({
    where: {
      companyId: company.id,
      createdAt: { gte: startDate },
    },
    orderBy: { createdAt: "desc" },
  });

  const summary = {
    totalCost: 0,
    textCost: 0,
    imageCost: 0,
    textGenerations: 0,
    imageGenerations: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalImages: 0,
  };

  for (const log of logs) {
    summary.totalCost += log.costUsd;
    if (log.type === "text") {
      summary.textCost += log.costUsd;
      summary.textGenerations += 1;
      summary.totalInputTokens += log.inputTokens;
      summary.totalOutputTokens += log.outputTokens;
    } else if (log.type === "image") {
      summary.imageCost += log.costUsd;
      summary.imageGenerations += 1;
      summary.totalImages += log.images;
    }
  }

  // Agrupar por dia para gráfico
  const daily: Record<string, { text: number; image: number; total: number }> = {};
  for (const log of logs) {
    const day = log.createdAt.toISOString().split("T")[0];
    if (!daily[day]) daily[day] = { text: 0, image: 0, total: 0 };
    daily[day].total += log.costUsd;
    if (log.type === "text") daily[day].text += log.costUsd;
    if (log.type === "image") daily[day].image += log.costUsd;
  }

  return NextResponse.json({
    summary,
    daily: Object.entries(daily)
      .map(([date, costs]) => ({ date, ...costs }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    logs: logs.slice(0, 50).map((l) => ({
      id: l.id,
      type: l.type,
      model: l.model,
      inputTokens: l.inputTokens,
      outputTokens: l.outputTokens,
      images: l.images,
      costUsd: l.costUsd,
      createdAt: l.createdAt,
    })),
  });
}
