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
  const company = await prisma.company.findUnique({ where: { userId } });

  if (!company) {
    return NextResponse.json({ error: "Empresa não configurada" }, { status: 400 });
  }

  const body = await request.json();
  const { postId, scheduledAt, recurrence } = body;

  if (!postId || !scheduledAt) {
    return NextResponse.json(
      { error: "Post ID e data de agendamento são obrigatórios" },
      { status: 400 }
    );
  }

  const post = await prisma.post.findFirst({
    where: { id: postId, companyId: company.id },
  });

  if (!post) {
    return NextResponse.json({ error: "Post não encontrado" }, { status: 404 });
  }

  const scheduled = new Date(scheduledAt);
  if (scheduled <= new Date()) {
    return NextResponse.json(
      { error: "A data de agendamento deve ser no futuro" },
      { status: 400 }
    );
  }

  if (recurrence && recurrence !== "none") {
    const dates = generateRecurrenceDates(scheduled, recurrence, 4);

    const posts = await Promise.all(
      dates.map((date, index) => {
        if (index === 0) {
          return prisma.post.update({
            where: { id: postId },
            data: { status: "scheduled", scheduledAt: date },
          });
        }
        return prisma.post.create({
          data: {
            companyId: company.id,
            platform: post.platform,
            content: post.content,
            imageUrl: post.imageUrl,
            status: "scheduled",
            scheduledAt: date,
          },
        });
      })
    );

    return NextResponse.json({ scheduled: posts.length, posts });
  }

  const updated = await prisma.post.update({
    where: { id: postId },
    data: { status: "scheduled", scheduledAt: scheduled },
  });

  return NextResponse.json(updated);
}

function generateRecurrenceDates(
  startDate: Date,
  recurrence: string,
  count: number
): Date[] {
  const dates: Date[] = [startDate];

  for (let i = 1; i < count; i++) {
    const prev = new Date(dates[i - 1]);
    switch (recurrence) {
      case "daily":
        prev.setDate(prev.getDate() + 1);
        break;
      case "weekly":
        prev.setDate(prev.getDate() + 7);
        break;
      case "biweekly":
        prev.setDate(prev.getDate() + 14);
        break;
      case "monthly":
        prev.setMonth(prev.getMonth() + 1);
        break;
    }
    dates.push(new Date(prev));
  }

  return dates;
}
