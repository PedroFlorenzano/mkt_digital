/**
 * POST /api/auth/reset-password
 *
 * Validates a reset token and updates the user's password.
 */

import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@server/lib/prisma";

export async function POST(request: Request) {
  let token: string | undefined;
  let password: string | undefined;

  try {
    const body = (await request.json()) as { token?: unknown; password?: unknown };
    if (typeof body.token === "string") token = body.token.trim();
    if (typeof body.password === "string") password = body.password;
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (!token || !password) {
    return NextResponse.json({ error: "Token e senha são obrigatórios" }, { status: 400 });
  }

  if (password.length < 6) {
    return NextResponse.json({ error: "A senha deve ter pelo menos 6 caracteres" }, { status: 400 });
  }

  // Find valid, unused, non-expired token
  const resetToken = await prisma.passwordResetToken.findUnique({
    where: { token },
    include: { user: { select: { id: true, email: true } } },
  });

  if (!resetToken) {
    return NextResponse.json({ error: "Token inválido ou expirado" }, { status: 400 });
  }

  if (resetToken.used) {
    return NextResponse.json({ error: "Este link já foi utilizado. Solicite um novo." }, { status: 400 });
  }

  if (resetToken.expiresAt < new Date()) {
    return NextResponse.json({ error: "Este link expirou. Solicite um novo." }, { status: 400 });
  }

  // Hash new password and update user
  const hashedPassword = await bcrypt.hash(password, 12);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: resetToken.userId },
      data: { password: hashedPassword },
    }),
    prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { used: true },
    }),
  ]);

  return NextResponse.json({ message: "Senha redefinida com sucesso. Você já pode fazer login." });
}
