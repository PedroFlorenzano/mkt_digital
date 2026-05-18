import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@server/lib/auth";
import { companyService } from "@server/services/company.service";
import { generateTextWithBedrock } from "@server/lib/bedrock";

const toneInstructions: Record<string, string> = {
  professional:
    "Use linguagem corporativa, formal e confiável. Transmita autoridade e credibilidade.",
  funny:
    "Use humor, trocadilhos e linguagem descontraída. Seja leve e divertido sem perder relevância.",
  informative:
    "Foque em educar o público com dados e informações úteis. Seja claro e didático.",
  inspirational:
    "Use linguagem motivacional e emocional. Inspire ação e engajamento.",
};

const platformInstructions: Record<string, string> = {
  instagram:
    "Máximo 2200 caracteres. Use emojis estrategicamente. Inclua CTA. Sugira hashtags relevantes (máximo 10).",
  facebook:
    "Tom conversacional. Pode ser mais longo. Incentive comentários e compartilhamentos.",
  linkedin:
    "Tom profissional e orientado a negócios. Conte histórias de aprendizado. Use parágrafos curtos.",
  whatsapp:
    "Texto curto e direto. Máximo 500 caracteres. Ideal para status ou mensagens de broadcast.",
};

const SUPPORTED_PLATFORMS = Object.keys(platformInstructions);

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

  let body: {
    platform?: unknown;
    idea?: unknown;
    topic?: unknown;
    trendingContext?: unknown;
    referenceImages?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const platform = typeof body.platform === "string" ? body.platform : "";
  const idea = typeof body.idea === "string" ? body.idea.trim() : "";
  const topic = typeof body.topic === "string" ? body.topic.trim() : "";
  const trendingContext = typeof body.trendingContext === "string" ? body.trendingContext.trim() : "";
  const referenceImages = Array.isArray(body.referenceImages) ? body.referenceImages : [];

  if (!platform) {
    return NextResponse.json({ error: "Plataforma é obrigatória" }, { status: 400 });
  }
  if (!SUPPORTED_PLATFORMS.includes(platform)) {
    return NextResponse.json(
      { error: `Plataforma não suportada. Use: ${SUPPORTED_PLATFORMS.join(", ")}` },
      { status: 400 },
    );
  }

  const toneGuide = toneInstructions[company.tone] ?? toneInstructions.professional;
  const platformGuide = platformInstructions[platform];

  let contextSection = "";
  if (trendingContext) {
    contextSection += `\nASSUNTOS DO MOMENTO (dados atualizados da internet):\n${trendingContext}\n\nUse essas informações para criar posts relevantes e atuais. Conecte o assunto do momento com o que a empresa faz.`;
  }
  if (referenceImages.length > 0) {
    contextSection += `\n\nIMAGENS DE REFERÊNCIA: O usuário enviou ${referenceImages.length} imagem(ns) de referência para dar contexto visual ao que deseja. Considere o estilo, composição e tema dessas imagens ao criar os textos.`;
  }

  const systemPrompt = `Você é um especialista em marketing digital e criação de conteúdo para redes sociais.

EMPRESA: ${company.name}
DESCRIÇÃO: ${company.description || "Não informada"}
SETOR: ${company.sector || "Não informado"}
OBJETIVO: ${company.objective || "Não informado"}

TOM DE COMUNICAÇÃO: ${toneGuide}

REGRAS PARA ${platform.toUpperCase()}: ${platformGuide}
${contextSection}

Gere EXATAMENTE 3 opções de texto para postagem. Cada opção deve ser diferente em abordagem mas manter o mesmo tom.
Retorne APENAS JSON válido neste formato:
{
  "options": [
    { "title": "título curto da opção", "content": "texto completo do post" },
    { "title": "título curto da opção", "content": "texto completo do post" },
    { "title": "título curto da opção", "content": "texto completo do post" }
  ]
}`;

  let userMessage = "";
  if (idea) {
    userMessage = `Crie posts sobre: ${idea}`;
  } else {
    userMessage = "Crie posts relevantes para essa empresa";
  }
  if (topic) {
    userMessage += `. Assunto/tema solicitado: ${topic}`;
  }
  if (trendingContext && !topic) {
    userMessage += `. Use os assuntos do momento fornecidos no contexto para criar posts atuais e engajantes.`;
  }

  try {
    const result = await generateTextWithBedrock(company.id, systemPrompt, userMessage);
    return NextResponse.json({
      options: result.options.slice(0, 3),
      usage: result.usage,
    });
  } catch (err) {
    console.error("[generate/text] Bedrock error:", err);
    const message = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json(
      { error: `Erro ao gerar texto: ${message}` },
      { status: 502 },
    );
  }
}
