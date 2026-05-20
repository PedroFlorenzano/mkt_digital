import { prisma } from "@server/lib/prisma";
import { generateTextWithBedrock } from "@server/lib/bedrock";
import { ValidationError, NotFoundError } from "@server/lib/errors";
import { logger } from "@server/lib/logger";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface AuditInput {
  bio: string;           // current bio text
  followerCount: number; // ≥ 0
  engagementRate: number; // 0.00–100.00 (percentage)
  niche: string;         // e.g. "moda feminina"
}

export interface ComponentScore {
  name: string;
  score: number;    // 0–100
  feedback: string;
}

export interface AuditResult {
  overallScore: number;         // integer 0–100
  components: ComponentScore[]; // bio, visual consistency, posting frequency, engagement
  recommendations: string[];    // min 3 items
  generatedAt: Date;
}

// ---------------------------------------------------------------------------
// Fallback recommendations when AI returns fewer than 3
// ---------------------------------------------------------------------------

const GENERIC_RECOMMENDATIONS = [
  "Poste de forma consistente para aumentar o engajamento com seus seguidores.",
  "Utilize hashtags relevantes ao seu nicho para ampliar o alcance das publicações.",
  "Invista em conteúdo visual de alta qualidade para destacar sua marca no feed.",
  "Interaja com seus seguidores respondendo comentários e mensagens diretas.",
  "Analise os horários de maior engajamento e programe suas publicações nesse período.",
];

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

function buildSystemPrompt(): string {
  return `Você é um especialista em marketing digital e gestão de perfis no Instagram.
Analise o perfil do usuário com base nas informações fornecidas e retorne APENAS o seguinte JSON (sem markdown, sem texto extra):
{
  "overallScore": number,
  "components": [
    { "name": "Bio", "score": number, "feedback": "..." },
    { "name": "Consistência visual", "score": number, "feedback": "..." },
    { "name": "Frequência de postagem", "score": number, "feedback": "..." },
    { "name": "Engajamento", "score": number, "feedback": "..." }
  ],
  "recommendations": ["...", "...", "..."]
}

Regras:
- overallScore deve ser um inteiro entre 0 e 100.
- Cada score de componente deve ser um número entre 0 e 100.
- recommendations deve conter pelo menos 3 sugestões práticas e específicas ao nicho informado.
- Responda sempre em português brasileiro.
- Retorne SOMENTE o JSON, sem nenhum texto adicional.`;
}

function buildUserMessage(
  input: AuditInput,
  company: { objective: string | null; tone: string; sector: string | null },
): string {
  return `Perfil para análise:
- Bio: ${input.bio}
- Nicho: ${input.niche}
- Número de seguidores: ${input.followerCount}
- Taxa de engajamento: ${input.engagementRate}%
- Objetivo da empresa: ${company.objective ?? "não informado"}
- Tom de comunicação: ${company.tone}
- Setor: ${company.sector ?? "não informado"}

Por favor, forneça o diagnóstico completo do perfil.`;
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * Audits an Instagram profile and returns a structured AI-generated diagnosis
 * with per-component scores and actionable recommendations.
 *
 * Steps:
 *  1. Validate input — throws ValidationError listing any invalid fields.
 *  2. Load company (objective, tone, sector) — throws NotFoundError if absent.
 *  3. Build a Claude prompt with the profile data and company context.
 *  4. Call generateTextWithBedrock and extract the JSON response.
 *  5. Parse the response into AuditResult shape.
 *  6. Clamp overallScore to integer [0, 100] as a safety net.
 *  7. Pad recommendations to a minimum of 3 items if needed.
 *  8. Return AuditResult.
 *
 * @param companyId - ID of the company being audited.
 * @param input     - Profile metrics and bio to analyse.
 * @returns         AuditResult with scores, component feedback, and recommendations.
 * @throws {ValidationError} if bio/niche are empty, followerCount < 0, or engagementRate out of range.
 * @throws {NotFoundError}   if no company with the given ID exists.
 */
export async function auditProfile(
  companyId: string,
  input: AuditInput,
): Promise<AuditResult> {
  // ── Step 1: Validate input ───────────────────────────────────────────────
  const invalidFields: string[] = [];

  if (!input.bio || input.bio.trim() === "") {
    invalidFields.push("bio");
  }
  if (!input.niche || input.niche.trim() === "") {
    invalidFields.push("niche");
  }
  if (typeof input.followerCount !== "number" || input.followerCount < 0) {
    invalidFields.push("followerCount (deve ser ≥ 0)");
  }
  if (
    typeof input.engagementRate !== "number" ||
    input.engagementRate < 0 ||
    input.engagementRate > 100
  ) {
    invalidFields.push("engagementRate (deve estar entre 0 e 100)");
  }

  if (invalidFields.length > 0) {
    throw new ValidationError(
      `Campos ausentes ou inválidos: ${invalidFields.join(", ")}`,
      { invalidFields },
    );
  }

  // ── Step 2: Load company from Prisma ─────────────────────────────────────
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, objective: true, tone: true, sector: true },
  });

  if (!company) {
    throw new NotFoundError("Company");
  }

  // ── Steps 3–4: Build prompt and call Bedrock ─────────────────────────────
  const systemPrompt = buildSystemPrompt();
  const userMessage = buildUserMessage(input, company);

  logger.info("[profile-auditor] Calling Bedrock for profile audit", {
    companyId,
    niche: input.niche,
    followerCount: input.followerCount,
    engagementRate: input.engagementRate,
  });

  const bedrockResult = await generateTextWithBedrock(
    companyId,
    systemPrompt,
    userMessage,
  );

  // ── Step 5: Parse the JSON response ──────────────────────────────────────
  // generateTextWithBedrock attempts its own JSON parse; we extract the raw
  // text and re-parse to get our specific shape (same pattern as
  // budget-intelligence.service.ts).
  const rawText =
    bedrockResult.options?.[0]?.content ??
    JSON.stringify(bedrockResult.options?.[0] ?? {});

  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    logger.error(
      "[profile-auditor] Bedrock returned no valid JSON",
      undefined,
      { companyId, rawText: rawText.slice(0, 500) },
    );
    throw new Error(
      `Resposta da IA não contém JSON válido. Conteúdo: ${rawText.slice(0, 300)}`,
    );
  }

  let parsed: {
    overallScore: number;
    components: ComponentScore[];
    recommendations: string[];
  };

  try {
    parsed = JSON.parse(jsonMatch[0]) as typeof parsed;
  } catch (err) {
    logger.error(
      "[profile-auditor] Failed to parse Bedrock JSON response",
      err,
      { companyId, jsonFragment: jsonMatch[0].slice(0, 500) },
    );
    throw new Error("Falha ao parsear a resposta JSON da IA.");
  }

  // ── Step 6: Clamp overallScore to integer [0, 100] ───────────────────────
  const overallScore = Math.min(
    100,
    Math.max(0, Math.round(parsed.overallScore ?? 0)),
  );

  // ── Step 7: Ensure recommendations.length >= 3 ───────────────────────────
  const recommendations: string[] = Array.isArray(parsed.recommendations)
    ? [...parsed.recommendations]
    : [];

  let genericIdx = 0;
  while (recommendations.length < 3 && genericIdx < GENERIC_RECOMMENDATIONS.length) {
    const rec = GENERIC_RECOMMENDATIONS[genericIdx];
    if (rec !== undefined) {
      recommendations.push(rec);
    }
    genericIdx++;
  }

  // ── Step 8: Return AuditResult ────────────────────────────────────────────
  const result: AuditResult = {
    overallScore,
    components: Array.isArray(parsed.components) ? parsed.components : [],
    recommendations,
    generatedAt: new Date(),
  };

  logger.info("[profile-auditor] Profile audit completed", {
    companyId,
    overallScore: result.overallScore,
    componentsCount: result.components.length,
    recommendationsCount: result.recommendations.length,
    model: bedrockResult.usage.model,
    inputTokens: bedrockResult.usage.inputTokens,
    outputTokens: bedrockResult.usage.outputTokens,
  });

  return result;
}
