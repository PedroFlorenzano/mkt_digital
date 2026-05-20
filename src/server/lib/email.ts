/**
 * email.ts
 *
 * Serviço de envio de emails via Resend (https://resend.com).
 * Usa fetch nativo — sem dependência de pacote externo.
 *
 * Para usar:
 *   1. Crie uma conta em resend.com
 *   2. Gere uma API key em resend.com/api-keys
 *   3. Adicione ao .env: RESEND_API_KEY e EMAIL_FROM
 *   4. Verifique seu domínio em resend.com/domains
 *
 * Enquanto RESEND_API_KEY não estiver configurado, os emails são
 * apenas logados no console (modo desenvolvimento).
 */

const RESEND_API_URL = "https://api.resend.com/emails";

export interface EmailPayload {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

/**
 * Sends an email via Resend API.
 * Falls back to console.log when RESEND_API_KEY is not configured.
 */
export async function sendEmail(payload: EmailPayload): Promise<{ success: boolean; id?: string; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "MKT Digital <noreply@mktdigital.com>";

  // Development fallback — log instead of sending
  if (!apiKey) {
    console.log("\n[email] ⚠️  RESEND_API_KEY não configurado. Email simulado:");
    console.log(`  To:      ${Array.isArray(payload.to) ? payload.to.join(", ") : payload.to}`);
    console.log(`  Subject: ${payload.subject}`);
    console.log(`  Preview: ${payload.text?.slice(0, 200) ?? "(html only)"}`);
    console.log("");
    return { success: true, id: "dev-simulated" };
  }

  try {
    const res = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: Array.isArray(payload.to) ? payload.to : [payload.to],
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
      }),
    });

    const data = (await res.json()) as { id?: string; name?: string; message?: string };

    if (!res.ok) {
      const errorMsg = data.message ?? data.name ?? `HTTP ${res.status}`;
      console.error("[email] Resend error:", errorMsg);
      return { success: false, error: errorMsg };
    }

    return { success: true, id: data.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    console.error("[email] Network error:", message);
    return { success: false, error: message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Email templates
// ─────────────────────────────────────────────────────────────────────────────

const baseStyles = `
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  color: #111827;
  background-color: #f9fafb;
  margin: 0;
  padding: 0;
`;

function emailWrapper(content: string): string {
  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="${baseStyles}">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding: 40px 16px;">
        <table width="100%" style="max-width: 520px; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);" cellpadding="0" cellspacing="0">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #2563EB, #4F46E5); padding: 28px 32px;">
              <p style="margin:0; font-size: 20px; font-weight: 700; color: #ffffff; letter-spacing: -0.5px;">
                ✦ MKT Digital
              </p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding: 32px;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 32px; border-top: 1px solid #f3f4f6; background: #f9fafb;">
              <p style="margin:0; font-size: 12px; color: #9ca3af; text-align: center;">
                Você recebeu este email porque sua conta está associada a este endereço.<br/>
                Se não foi você, ignore este email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

/**
 * Sends a password reset email with a secure link.
 */
export async function sendPasswordResetEmail(
  to: string,
  name: string | null,
  resetUrl: string,
): Promise<{ success: boolean; error?: string }> {
  const firstName = name?.split(" ")[0] ?? "usuário";

  const html = emailWrapper(`
    <h2 style="margin: 0 0 8px; font-size: 22px; font-weight: 700; color: #111827;">
      Redefinir sua senha
    </h2>
    <p style="margin: 0 0 24px; font-size: 15px; color: #6b7280; line-height: 1.6;">
      Olá, ${firstName}! Recebemos uma solicitação para redefinir a senha da sua conta no MKT Digital.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center" style="padding: 8px 0 28px;">
          <a href="${resetUrl}"
             style="display: inline-block; background: linear-gradient(135deg, #2563EB, #4F46E5); color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 10px; padding: 14px 32px;">
            Redefinir minha senha
          </a>
        </td>
      </tr>
    </table>

    <p style="margin: 0 0 8px; font-size: 13px; color: #9ca3af;">
      Ou copie e cole este link no navegador:
    </p>
    <p style="margin: 0 0 24px; font-size: 12px; color: #6b7280; word-break: break-all; background: #f9fafb; padding: 10px 12px; border-radius: 8px; border: 1px solid #e5e7eb;">
      ${resetUrl}
    </p>

    <div style="background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; padding: 14px 16px;">
      <p style="margin: 0; font-size: 13px; color: #9a3412;">
        ⚠️ Este link expira em <strong>1 hora</strong>. Se você não solicitou a redefinição, ignore este email.
      </p>
    </div>
  `);

  return sendEmail({
    to,
    subject: "Redefinição de senha — MKT Digital",
    html,
    text: `Olá, ${firstName}!\n\nRedefinir sua senha:\n${resetUrl}\n\nEste link expira em 1 hora.`,
  });
}

/**
 * Sends a welcome email after successful registration.
 */
export async function sendWelcomeEmail(
  to: string,
  name: string | null,
  loginUrl: string,
): Promise<{ success: boolean; error?: string }> {
  const firstName = name?.split(" ")[0] ?? "usuário";

  const html = emailWrapper(`
    <h2 style="margin: 0 0 8px; font-size: 22px; font-weight: 700; color: #111827;">
      Bem-vindo ao MKT Digital! 🎉
    </h2>
    <p style="margin: 0 0 20px; font-size: 15px; color: #6b7280; line-height: 1.6;">
      Olá, ${firstName}! Sua conta foi criada com sucesso. Agora você tem acesso à plataforma de marketing digital com IA.
    </p>

    <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; padding: 16px 20px; margin-bottom: 24px;">
      <p style="margin: 0 0 8px; font-size: 13px; font-weight: 600; color: #166534;">O que você pode fazer agora:</p>
      <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #15803d; line-height: 1.8;">
        <li>Criar posts com texto e imagens gerados por IA</li>
        <li>Publicar diretamente no Instagram, Facebook, LinkedIn e TikTok</li>
        <li>Criar carrosséis, Reels e Stories automaticamente</li>
        <li>Gerenciar campanhas de tráfego pago com análise estratégica</li>
      </ul>
    </div>

    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center">
          <a href="${loginUrl}"
             style="display: inline-block; background: linear-gradient(135deg, #2563EB, #4F46E5); color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 10px; padding: 14px 32px;">
            Acessar a plataforma
          </a>
        </td>
      </tr>
    </table>
  `);

  return sendEmail({
    to,
    subject: "Bem-vindo ao MKT Digital 🎉",
    html,
    text: `Olá, ${firstName}!\n\nSua conta no MKT Digital foi criada. Acesse: ${loginUrl}`,
  });
}
