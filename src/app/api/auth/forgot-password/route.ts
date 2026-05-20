/**
 * POST /api/auth/forgot-password
 *
 * Receives an email address, generates a secure reset token,
 * saves it to the database, and sends a reset link via email.
 *
 * Always returns 200 to prevent user enumeration attacks.
 */

import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@server/lib/prisma";
import { sendPasswordResetEmail } from "@server/lib/email";

const TOKEN_EXPIRY_HOURS = 1;

export async function POST(request: Request) {
  let email: string | undefined;

  try {
    const body = (await request.json()) as { email?: unknown };
    if (typeof body.email === "string") {
      email = body.email.toLowerCase().trim();
    }
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (!email) {
    return NextResponse.json({ error: "Email é obrigatório" }, { status: 400 });
  }

  // Always return success to avoid user enumeration
  const genericSuccess = NextResponse.json({
    message: "Se este email estiver cadastrado, você receberá um link de redefinição em breve.",
  });

  // Look up the user
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true },
  });

  if (!user) {
    // Return success without sending — don't reveal whether user exists
    return genericSuccess;
  }

  // Invalidate any existing tokens for this user
  await prisma.passwordResetToken.updateMany({
    where: { userId: user.id, used: false },
    data: { used: true },
  });

  // Generate a secure random token
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      token,
      expiresAt,
    },
  });

  // Build reset URL
  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3030";
  const resetUrl = `${baseUrl}/reset-password?token=${token}`;

  // Send email (falls back to console.log in dev without RESEND_API_KEY)
  await sendPasswordResetEmail(user.email!, user.name, resetUrl);

  return genericSuccess;
}
