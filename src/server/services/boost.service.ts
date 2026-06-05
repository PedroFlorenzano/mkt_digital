/**
 * boost.service.ts
 *
 * Serviço de turbinação de posts (Post Boost / Boost_Advisor).
 *
 * Responsabilidades:
 *  - analyzePost: analisa um post publicado ou agendado via AWS Bedrock e
 *    retorna uma BoostSuggestion com objetivo, público-alvo, orçamento diário
 *    e duração recomendados.
 *  - confirmBoost: registra a Confirmation_Event do usuário como
 *    CampaignAuditLog e cria o AdCampaign correspondente com
 *    campaignType = "boost".
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8
 */

import { generateTextWithBedrock } from "@server/lib/bedrock";
import { ExternalServiceError, NotFoundError, ValidationError } from "@server/lib/errors";
import { logger } from "@server/lib/logger";
import { companyRepository } from "@server/repositories/company.repository";
import { postRepository } from "@server/repositories/post.repository";
import { credentialRepository } from "@server/repositories/credential.repository";
import { boostRepository } from "@server/repositories/boost.repository";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface BoostSuggestion {
  /** e.g. "Aumentar alcance", "Gerar leads" */
  objective: string;
  /** e.g. "Mulheres 25-45, interesse em moda" */
  targetAudience: string;
  /** R$ 5.00 – 300.00 */
  dailyBudgetBrl: number;
  /** 1 – 30 days */
  durationDays: number;
  /** AI justification */
  rationale: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DAILY_BUDGET_MIN = 5;
const DAILY_BUDGET_MAX = 300;
const DURATION_MIN = 1;
const DURATION_MAX = 30;

const VALID_POST_STATUSES = ["published", "scheduled"] as const;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Clamps a numeric value to [min, max].
 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Builds the Bedrock prompt for boost suggestion generation.
 */
function buildBoostPrompt(
  company: {
    name: string;
    sector: string | null;
    objective: string | null;
    tone: string;
    colors: string | null;
  },
  post: {
    content: string | null;
    imageUrl: string | null;
    platform: string;
    format: string | null;
  },
): string {
  return `Você é um especialista em marketing digital e gestão de campanhas de anúncios pagos.
Analise o post abaixo e sugira a melhor configuração de impulsionamento (boost) para maximizar o retorno.

CONTEXTO DA EMPRESA:
- Nome: ${company.name}
- Setor: ${company.sector ?? "não informado"}
- Objetivo de negócio: ${company.objective ?? "não informado"}
- Tom de voz: ${company.tone}
- Paleta de cores: ${company.colors ?? "não informada"}

DADOS DO POST:
- Plataforma: ${post.platform}
- Formato: ${post.format ?? "post"}
- Conteúdo textual: ${post.content ? `"${post.content}"` : "(sem texto)"}
- Imagem: ${post.imageUrl ? "presente" : "ausente"}

INSTRUÇÕES:
1. Considere o setor, objetivo e tom de voz da empresa ao sugerir público-alvo e objetivo da campanha.
2. Sugira um orçamento diário realista em BRL entre R$ ${DAILY_BUDGET_MIN},00 e R$ ${DAILY_BUDGET_MAX},00.
3. Sugira uma duração em dias entre ${DURATION_MIN} e ${DURATION_MAX} dias.
4. O objetivo deve ser claro e alinhado ao setor da empresa (ex.: "Aumentar alcance", "Gerar leads", "Aumentar engajamento").
5. O público-alvo deve ser específico e baseado no setor e objetivo da empresa.
6. A justificativa deve ser objetiva e profissional, em português, explicando por que a configuração sugerida é adequada.

Responda APENAS com o seguinte JSON (sem markdown, sem texto extra):
{
  "objective": "string — objetivo da campanha de boost",
  "targetAudience": "string — descrição do público-alvo sugerido",
  "dailyBudgetBrl": number,
  "durationDays": number,
  "rationale": "string — justificativa da sugestão"
}`;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const boostService = {
  // -------------------------------------------------------------------------
  // analyzePost
  // -------------------------------------------------------------------------

  /**
   * Analisa um post publicado ou agendado via AWS Bedrock e retorna uma
   * BoostSuggestion com configuração recomendada para impulsionamento.
   *
   * Algoritmo:
   *  1. Carrega company (name, sector, objective, tone, colors).
   *  2. Carrega post (content, imageUrl, platform, format).
   *  3. Lança NotFoundError se company ou post não existirem.
   *  4. Lança ValidationError se post.status não for "published" nem "scheduled".
   *  5. Constrói prompt e chama generateTextWithBedrock.
   *  6. Faz parse da resposta JSON em BoostSuggestion.
   *  7. Faz clamp de dailyBudgetBrl em [5, 300] e durationDays em [1, 30].
   *  8. Salva sugestão em post.boostSuggestionJson.
   *  9. Retorna BoostSuggestion.
   *
   * @throws {NotFoundError} se company ou post não existirem.
   * @throws {ValidationError} se post.status for inválido para boost.
   * @throws {ExternalServiceError} se o Bedrock falhar.
   */
  async analyzePost(companyId: string, postId: string): Promise<BoostSuggestion> {
    // 1. Load company
    const company = await companyRepository.findByIdForPrompt(companyId);

    if (!company) {
      throw new NotFoundError(`Empresa com id '${companyId}'`);
    }

    // 2. Load post
    const post = await postRepository.findById(postId);

    if (!post) {
      throw new NotFoundError(`Post com id '${postId}'`);
    }

    // 3. Ensure the post belongs to this company
    if (post.companyId !== companyId) {
      throw new NotFoundError(`Post com id '${postId}'`);
    }

    // 4. Validate post status
    if (!(VALID_POST_STATUSES as readonly string[]).includes(post.status)) {
      throw new ValidationError(
        `O post deve ter status "published" ou "scheduled" para ser turbinado. Status atual: "${post.status}".`,
      );
    }

    // 5. Build prompt and call Bedrock
    const systemPrompt = buildBoostPrompt(company, post);
    const userMessage =
      "Gere a sugestão de configuração de boost para o post descrito acima.";

    let suggestion: BoostSuggestion;

    try {
      const bedrockResult = await generateTextWithBedrock(
        companyId,
        systemPrompt,
        userMessage,
      );

      // generateTextWithBedrock wraps parsed content in options[0].content
      const rawText =
        bedrockResult.options?.[0]?.content ??
        JSON.stringify(bedrockResult.options?.[0] ?? {});

      // Extract JSON object from the response text
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error(
          `Resposta da IA não contém JSON válido. Conteúdo: ${rawText.slice(0, 300)}`,
        );
      }

      const parsed = JSON.parse(jsonMatch[0]) as Partial<BoostSuggestion>;

      if (
        typeof parsed.objective !== "string" ||
        typeof parsed.targetAudience !== "string" ||
        typeof parsed.dailyBudgetBrl !== "number" ||
        typeof parsed.durationDays !== "number" ||
        typeof parsed.rationale !== "string"
      ) {
        throw new Error(
          "Resposta da IA não segue o formato esperado (objective, targetAudience, dailyBudgetBrl, durationDays, rationale).",
        );
      }

      // 7. Clamp numeric fields to valid ranges
      suggestion = {
        objective: parsed.objective,
        targetAudience: parsed.targetAudience,
        dailyBudgetBrl: clamp(parsed.dailyBudgetBrl, DAILY_BUDGET_MIN, DAILY_BUDGET_MAX),
        durationDays: clamp(
          Math.round(parsed.durationDays),
          DURATION_MIN,
          DURATION_MAX,
        ),
        rationale: parsed.rationale,
      };

      logger.info("[boost] analyzePost — Bedrock response received", {
        companyId,
        postId,
        model: bedrockResult.usage.model,
        inputTokens: bedrockResult.usage.inputTokens,
        outputTokens: bedrockResult.usage.outputTokens,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("[boost] analyzePost — Bedrock call failed", err, {
        companyId,
        postId,
      });
      throw new ExternalServiceError("AWS Bedrock", message);
    }

    // 8. Persist suggestion to post.boostSuggestionJson
    await postRepository.updateBoostSuggestion(postId, JSON.stringify(suggestion));

    logger.info("[boost] analyzePost — suggestion saved", {
      companyId,
      postId,
      dailyBudgetBrl: suggestion.dailyBudgetBrl,
      durationDays: suggestion.durationDays,
    });

    // 9. Return suggestion
    return suggestion;
  },

  // -------------------------------------------------------------------------
  // confirmBoost
  // -------------------------------------------------------------------------

  /**
   * Registra a Confirmation_Event do usuário e cria o AdCampaign de boost.
   *
   * Algoritmo:
   *  1. Carrega company e post (NotFoundError se não existirem).
   *  2. Cria CampaignAuditLog com actionType = "boost_confirmed".
   *  3. Verifica se existe AdPlatformCredential válida para a plataforma do post.
   *     - Se não existir, usa sentinel "none" (campanha fica em "draft").
   *  4. Cria AdCampaign com campaignType = "boost".
   *  5. Atualiza post.boostCampaignId.
   *  6. NÃO chama nenhuma API externa de anúncios.
   *
   * @throws {NotFoundError} se company ou post não existirem.
   */
  async confirmBoost(
    companyId: string,
    postId: string,
    suggestion: BoostSuggestion,
    userId: string,
  ): Promise<void> {
    // 1. Load company
    const company = await companyRepository.findById(companyId);

    if (!company) {
      throw new NotFoundError(`Empresa com id '${companyId}'`);
    }

    // Load post
    const post = await postRepository.findById(postId);

    if (!post) {
      throw new NotFoundError(`Post com id '${postId}'`);
    }

    if (post.companyId !== companyId) {
      throw new NotFoundError(`Post com id '${postId}'`);
    }

    const now = new Date();

    // 2. Create CampaignAuditLog (Confirmation_Event)
    const auditLog = await boostRepository.createAuditLog({
      companyId,
      actionType: "boost_confirmed",
      source: "user",
      userDecision: "approved",
      userDecisionAt: now,
      requiresConfirmation: true,
      metadata: JSON.stringify({
        userId,
        postId,
        suggestion,
      }),
    });

    logger.info("[boost] confirmBoost — audit log created", {
      companyId,
      postId,
      auditLogId: auditLog.id,
      userId,
    });

    // 3. Find valid AdPlatformCredential for the post's platform.
    // Map post platform to ad credential platform (instagram posts use meta ads).
    const adPlatform = post.platform === "instagram" ? "meta" : post.platform;

    const credential = await credentialRepository.findValidByCompanyAndPlatform(companyId, adPlatform);

    if (!credential) {
      // Per Req 5.5: no valid credentials → skip AdCampaign creation.
      // The audit log above already records the user's confirmation intent.
      // The caller (API route) is responsible for returning a text briefing to the user.
      logger.info(
        "[boost] confirmBoost — no valid credential found, skipping AdCampaign creation",
        { companyId, postId, adPlatform },
      );
      return;
    }

    // 4. Create AdCampaign with campaignType = "boost"
    const campaignName = `Boost: ${post.platform} - ${now.toLocaleDateString("pt-BR")}`;

    const campaign = await boostRepository.createAdCampaign({
      companyId,
      credentialId: credential.id,
      platform: adPlatform,
      campaignType: "boost",
      name: campaignName,
      objective: suggestion.objective,
      dailyBudgetBrl: suggestion.dailyBudgetBrl,
      status: "draft",
      sourcePostId: postId,
      boostConfirmedAt: now,
      aiDraftJson: JSON.stringify(suggestion),
    });

    logger.info("[boost] confirmBoost — AdCampaign created", {
      companyId,
      postId,
      campaignId: campaign.id,
      credentialId: credential.id,
    });

    // Update audit log to reference the new campaign
    await boostRepository.updateAuditLogCampaignId(auditLog.id, campaign.id);

    // 5. Update post.boostCampaignId
    await postRepository.updateBoostCampaignId(postId, campaign.id);

    logger.info("[boost] confirmBoost — post updated with boostCampaignId", {
      companyId,
      postId,
      campaignId: campaign.id,
    });

    // 6. No external ad platform API calls — handled elsewhere
  },
};
