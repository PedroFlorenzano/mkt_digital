import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@server/lib/prisma";
import { sendWelcomeEmail } from "@server/lib/email";

export async function POST(request: Request) {
  const body = await request.json();
  const { name, email, password } = body;

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email e senha são obrigatórios" },
      { status: 400 }
    );
  }

  if (password.length < 6) {
    return NextResponse.json(
      { error: "A senha deve ter pelo menos 6 caracteres" },
      { status: 400 }
    );
  }

  // Basic email format check
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return NextResponse.json(
      { error: "Formato de email inválido" },
      { status: 400 }
    );
  }

  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    return NextResponse.json(
      { error: "Email já cadastrado" },
      { status: 400 }
    );
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: {
      name,
      email,
      password: hashedPassword,
    },
  });

  // Send welcome email (non-blocking — failure doesn't affect registration)
  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3030";
  void sendWelcomeEmail(user.email!, user.name, `${baseUrl}/login`).catch(() => {});

  return NextResponse.json({
    id: user.id,
    name: user.name,
    email: user.email,
  });
}
