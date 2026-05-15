/**
 * campaign.service.ts
 *
 * AI-assisted campaign generation service for the Paid Traffic module.
 * Builds enriched system prompts from brand profiles and calls AWS Bedrock
 * (Claude) to produce structured CampaignDraft objects.
 *
 * Also provides launch() to create campaigns on ad platforms and persist them,
 * and listByCompany() for paginated campaign retrieval.
 */

import { prisma } from "@server/lib/prisma";
import { generateTextWithBedrock } from "@server/lib/bedrock";
import { ExternalServiceError, NotFoundError, ValidationError } from "@server/lib/errors";
import { logger } from "@server/lib/logger";
import type { AdCampaign, AdMetricSnapshot } from "@prisma/client";
import {
  AdPlatform,
  credentialService,
} from "@server/services/credential.service";
import { metaAdsConnector } from "@server/lib/meta-ads.connector";
import { googleAdsConnector } from "@server/lib/google-ads.connector";

// ---------------------------------------------------------------------------
// Exported TypeScript interfaces
// ---------------------------------------------------------------------------

export interface AudienceSegmentation {
  ageMin: number;
  ageMax: number;
  locations: string[];
  interests: string[];
  behaviors: string[];
}

export interface AdCopy {
  placement: string;
  /** Minimum 3 copy variations per placement */
  variations: string[];
  /** Minimum 5 for Google RSA */
  headlines?: string[];
  /** Minimum 3 for Google RSA */
  descriptions?: string[];
}

export interface Keyword {
  text: string;
  intent: "informational" | "navigational" | "transactional";
  matchType: "broad" | "phrase" | "exact";
}

export interface CampaignDraft {
  objective: string;
  audience: AudienceSegmentation;
  dailyBudgetBrl: number;
  adCopies: AdCopy[];
  creativeBrief: string;
  /** Required for Google Search campaigns — minimum 15 keywords */
  keywords?: Keyword[];
}

// Re-export AdPlatform for convenience
export type { AdPlatform } from "@server/services/credential.service";

/**
 * An AdCampaign record enriched with its most recent metric snapshot.
 */
export interface AdCampaignWithLatestMetrics extends AdCampaign {
  latestMetrics?: AdMetricSnapshot | null;
}

/**
 * AI-generated performance report for a campaign over a time window.
 */
export interface PerformanceReport {
  campaign: AdCampaign;
  snapshots: AdMetricSnapshot[];
  aiSummary: string;
  recommendations: string[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Builds the structured system prompt with the brand profile embedded.
 * Fields that are null/undefined are rendered as "Não informado" so the
 * company profile is always present in the prompt.
 */
function buildSystemPrompt(company: {
  name: string;
  description?: string | null;
  sector?: string | null;
  objective?: string | null;
  tone: string;
  colors?: string | null;
}): string {
  const safe = (value: string | null | undefined): string =>
    value?.trim() || "Não informado";

  return `Você é um especialista em tráfego pago e marketing digital.
Gere um rascunho de campanha de anúncios pagos em formato JSON estritamente seguindo a interface CampaignDraft abaixo.

PERFIL DA MARCA:
- Nome: ${safe(company.name)}
- Setor: ${safe(company.sector)}
- Objetivo do negócio: ${safe(company.objective)}
- Tom de voz: ${safe(company.tone)}
- Cores da marca: ${safe(company.colors)}
- Descrição: ${safe(company.description)}

INTERFACE ESPERADA (responda APENAS com o JSON, sem markdown, sem texto extra):
{
  "objective": "string — objetivo claro da campanha",
  "audience": {
    "ageMin": number,
    "ageMax": number,
    "locations": ["string"],
    "interests": ["string"],
    "behaviors": ["string"]
  },
  "dailyBudgetBrl": number,
  "adCopies": [
    {
      "placement": "string — ex: feed_instagram, stories, google_search_rsa",
      "variations": ["string", "string", "string"],
      "headlines": ["string (somente para Google RSA, mínimo 5)"],
      "descriptions": ["string (somente para Google RSA, mínimo 3)"]
    }
  ],
  "creativeBrief": "string — instruções para o designer criar os criativos visuais",
  "keywords": [
    {
      "text": "string — palavra-chave",
      "intent": "informational | navigational | transactional",
      "matchType": "broad | phrase | exact"
    }
  ]
}

REGRAS OBRIGATÓRIAS:
1. Cada posicionamento em adCopies deve ter no mínimo 3 variações de copy em "variations".
2. Para posicionamentos Google RSA: inclua pelo menos 5 "headlines" e 3 "descriptions".
3. Se a campanha for para Google Search, inclua "keywords" com no mínimo 15 palavras-chave cobrindo diferentes intenções (informational, navigational, transactional) e tipos de correspondência (broad, phrase, exact).
4. dailyBudgetBrl deve ser um número realista em BRL para o setor da empresa.
5. Responda SOMENTE com o objeto JSON — sem explicações, sem \`\`\`json, sem texto adicional.`;
}

/**
 * Validates the parsed CampaignDraft object against minimum structural rules.
 * Throws a descriptive Error if validation fails.
 */
function validateDraft(draft: unknown): CampaignDraft {
  if (!draft || typeof draft !== "object") {
    throw new Error("Resposta da IA não é um objeto JSON válido.");
  }

  const d = draft as Record<string, unknown>;

  // Required top-level fields
  if (typeof d.objective !== "string" || !d.objective.trim()) {
    throw new Error("Campo obrigatório ausente ou inválido: objective");
  }

  // audience
  const audience = d.audience as Record<string, unknown> | undefined;
  if (!audience || typeof audience !== "object") {
    throw new Error("Campo obrigatório ausente: audience");
  }
  if (typeof audience.ageMin !== "number") {
    throw new Error("Campo obrigatório ausente ou inválido: audience.ageMin");
  }
  if (typeof audience.ageMax !== "number") {
    throw new Error("Campo obrigatório ausente ou inválido: audience.ageMax");
  }
  if (!Array.isArray(audience.locations)) {
    throw new Error("Campo obrigatório ausente: audience.locations");
  }
  if (!Array.isArray(audience.interests)) {
    throw new Error("Campo obrigatório ausente: audience.interests");
  }
  if (!Array.isArray(audience.behaviors)) {
    throw new Error("Campo obrigatório ausente: audience.behaviors");
  }

  // dailyBudgetBrl
  if (typeof d.dailyBudgetBrl !== "number" || d.dailyBudgetBrl <= 0) {
    throw new Error(
      "Campo obrigatório ausente ou inválido: dailyBudgetBrl (deve ser um número positivo)"
    );
  }

  // adCopies
  if (!Array.isArray(d.adCopies) || d.adCopies.length === 0) {
    throw new Error("Campo obrigatório ausente: adCopies (deve ser um array não-vazio)");
  }
  for (const copy of d.adCopies as unknown[]) {
    const c = copy as Record<string, unknown>;
    if (typeof c.placement !== "string" || !c.placement.trim()) {
      throw new Error("adCopies: cada item deve ter um campo 'placement' (string)");
    }
    if (!Array.isArray(c.variations) || (c.variations as string[]).length < 3) {
      throw new Error(
        `adCopies[${c.placement}]: 'variations' deve ter no mínimo 3 entradas`
      );
    }
  }

  // creativeBrief
  if (typeof d.creativeBrief !== "string" || !d.creativeBrief.trim()) {
    throw new Error("Campo obrigatório ausente ou inválido: creativeBrief");
  }

  // keywords — if present, must have at least 15 entries with intent and matchType
  if (d.keywords !== undefined && d.keywords !== null) {
    if (!Array.isArray(d.keywords)) {
      throw new Error("Campo keywords deve ser um array quando presente.");
    }
    if ((d.keywords as unknown[]).length < 15) {
      throw new Error(
        `keywords deve conter no mínimo 15 entradas para campanhas Google Search (recebido: ${(d.keywords as unknown[]).length})`
      );
    }
    const validIntents = new Set(["informational", "navigational", "transactional"]);
    const validMatchTypes = new Set(["broad", "phrase", "exact"]);
    for (const kw of d.keywords as unknown[]) {
      const k = kw as Record<string, unknown>;
      if (typeof k.text !== "string" || !k.text.trim()) {
        throw new Error("keywords: cada entrada deve ter um campo 'text' (string)");
      }
      if (!validIntents.has(k.intent as string)) {
        throw new Error(
          `keywords['${k.text}']: 'intent' inválido ('${k.intent}'). Use: informational | navigational | transactional`
        );
      }
      if (!validMatchTypes.has(k.matchType as string)) {
        throw new Error(
          `keywords['${k.text}']: 'matchType' inválido ('${k.matchType}'). Use: broad | phrase | exact`
        );
      }
    }
  }

  return d as unknown as CampaignDraft;
}

// ---------------------------------------------------------------------------
// Campaign service
// ---------------------------------------------------------------------------

export const campaignService = {
  /**
   * Generates a CampaignDraft using AWS Bedrock (Claude).
   *
   * 1. Fetches the company profile from Prisma using companyId.
   * 2. Builds a system prompt enriched with brand profile fields
   *    (always included, even when some fields are null).
   * 3. Calls generateTextWithBedrock and parses the JSON response.
   * 4. Validates the parsed draft — throws if required fields are missing
   *    or minimum counts are not met.
   * 5. Re-throws any Bedrock failure as ExternalServiceError (HTTP 502).
   *
   * @throws {NotFoundError} if the company with the given id does not exist.
   * @throws {ExternalServiceError} if Bedrock fails.
   * @throws {Error} if the AI response is structurally invalid.
   */
  async generate(companyId: string, description: string): Promise<CampaignDraft> {
    // 1. Fetch company profile
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        name: true,
        description: true,
        sector: true,
        objective: true,
        tone: true,
        colors: true,
      },
    });

    if (!company) {
      throw new NotFoundError(`Empresa com id '${companyId}'`);
    }

    // 2. Build prompts
    const systemPrompt = buildSystemPrompt(company);
    const userMessage = `Crie uma campanha de tráfego pago para a seguinte descrição de objetivo:\n\n${description}`;

    // 3. Call Bedrock — wrap any error as ExternalServiceError (HTTP 502)
    let rawText: string;
    try {
      const result = await generateTextWithBedrock(companyId, systemPrompt, userMessage);

      // generateTextWithBedrock returns TextGenerationResult with options[]
      // The first option's content is the raw text from Claude
      const firstOption = result.options?.[0];
      rawText = firstOption?.content ?? "";

      logger.info("[campaign.service] Bedrock response received", {
        model: result.usage.model,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        costUsd: result.usage.costUsd,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("[campaign.service] Bedrock call failed", { error: message });
      throw new ExternalServiceError("AWS Bedrock", message);
    }

    // 4. Parse the JSON response from Claude
    let parsedDraft: unknown;
    try {
      // Claude may wrap the JSON in markdown fences despite instructions; strip them
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error(`Resposta não contém um objeto JSON. Conteúdo: ${rawText.slice(0, 200)}`);
      }
      parsedDraft = JSON.parse(jsonMatch[0]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("[campaign.service] Failed to parse Bedrock JSON response", {
        error: message,
        rawText: rawText.slice(0, 500),
      });
      throw new Error(`Falha ao parsear resposta JSON da IA: ${message}`);
    }

    // 5. Validate and return typed draft
    const draft = validateDraft(parsedDraft);

    logger.info("[campaign.service] CampaignDraft generated successfully", {
      companyId,
      objective: draft.objective,
      adCopiesCount: draft.adCopies.length,
      keywordsCount: draft.keywords?.length ?? 0,
    });

    return draft;
  },

  // ---------------------------------------------------------------------------
  // launch
  // ---------------------------------------------------------------------------

  /**
   * Launches a campaign draft onto one or more ad platforms.
   *
   * For each platform:
   *   1. Retrieves and validates credentials — throws ValidationError if not found.
   *   2. Calls the appropriate connector (Meta or Google).
   *   3. Persists AdCampaign to Prisma with all returned external IDs.
   *      If DB save fails after successful platform creation, marks the record
   *      with status 'error' and logs the inconsistency without hiding it.
   *   4. Writes a CampaignAuditLog entry with actionType 'campaign_created'.
   *
   * @throws {ValidationError} if a credential is missing for any platform.
   * @throws {ExternalServiceError} if the platform API call fails.
   */
  async launch(
    companyId: string,
    draft: CampaignDraft,
    platforms: AdPlatform[],
  ): Promise<AdCampaign[]> {
    const createdCampaigns: AdCampaign[] = [];

    for (const platform of platforms) {
      // ------------------------------------------------------------------
      // 1. Fetch credentials — convert NotFoundError to ValidationError
      // ------------------------------------------------------------------
      let creds: Awaited<ReturnType<typeof credentialService.get>>;
      try {
        creds = await credentialService.get(companyId, platform);
      } catch (err) {
        if (err instanceof NotFoundError) {
          throw new ValidationError(
            `Plataforma ${platform} não tem credenciais cadastradas.`,
          );
        }
        throw err;
      }

      // ------------------------------------------------------------------
      // 2. Call the platform connector
      // ------------------------------------------------------------------
      let externalCampaignId: string;
      let externalAdSetId: string | undefined;
      let externalAdIds: string[];
      let managerUrl: string;
      let campaignType: string;

      if (platform === "meta") {
        campaignType = "social";
        const result = await metaAdsConnector.createCampaign(creds, draft);
        externalCampaignId = result.externalCampaignId;
        externalAdSetId = result.externalAdSetId;
        externalAdIds = result.externalAdIds;
        managerUrl = result.managerUrl;
      } else {
        // Google — choose Search vs Display based on whether keywords exist
        const hasKeywords =
          Array.isArray(draft.keywords) && draft.keywords.length > 0;

        if (hasKeywords) {
          campaignType = "search";
          const result = await googleAdsConnector.createSearchCampaign(
            creds,
            draft,
          );
          externalCampaignId = result.externalCampaignId;
          externalAdSetId = result.externalAdGroupId;
          externalAdIds = result.externalAdIds;
          managerUrl = result.managerUrl;
        } else {
          campaignType = "display";
          const result = await googleAdsConnector.createDisplayCampaign(
            creds,
            draft,
          );
          externalCampaignId = result.externalCampaignId;
          externalAdSetId = result.externalAdGroupId;
          externalAdIds = result.externalAdIds;
          managerUrl = result.managerUrl;
        }
      }

      // ------------------------------------------------------------------
      // 3. Persist credential record — we need credentialId
      // ------------------------------------------------------------------
      const credentialRecord = await prisma.adPlatformCredential.findUnique({
        where: { companyId_platform: { companyId, platform } },
        select: { id: true },
      });

      // credentialRecord should always exist at this point (we just fetched
      // creds from it), but guard defensively
      if (!credentialRecord) {
        throw new ValidationError(
          `Plataforma ${platform} não tem credenciais cadastradas.`,
        );
      }

      // ------------------------------------------------------------------
      // 4. Persist AdCampaign — handle DB failure gracefully
      // ------------------------------------------------------------------
      let campaign: AdCampaign;
      try {
        campaign = await prisma.adCampaign.create({
          data: {
            companyId,
            credentialId: credentialRecord.id,
            platform,
            campaignType,
            name: draft.objective.slice(0, 255),
            objective: draft.objective,
            dailyBudgetBrl: draft.dailyBudgetBrl,
            status: "active",
            externalCampaignId,
            externalAdSetId: externalAdSetId ?? null,
            externalAdIds: JSON.stringify(externalAdIds),
            managerUrl,
            aiDraftJson: JSON.stringify(draft),
            launchedAt: new Date(),
          },
        });
      } catch (dbErr) {
        // Platform campaign was created but DB save failed — log the
        // inconsistency and attempt to record a minimal error row
        logger.error(
          "[campaign.service] DB save failed after platform campaign was created",
          dbErr,
          {
            companyId,
            platform,
            externalCampaignId,
            externalAdSetId,
            externalAdIds,
            managerUrl,
          },
        );

        // Attempt a minimal error record so operators can reconcile
        try {
          campaign = await prisma.adCampaign.create({
            data: {
              companyId,
              credentialId: credentialRecord.id,
              platform,
              campaignType,
              name: draft.objective.slice(0, 255),
              objective: draft.objective,
              dailyBudgetBrl: draft.dailyBudgetBrl,
              status: "error",
              externalCampaignId,
              externalAdSetId: externalAdSetId ?? null,
              externalAdIds: JSON.stringify(externalAdIds),
              managerUrl,
              aiDraftJson: JSON.stringify(draft),
              launchedAt: new Date(),
            },
          });
        } catch (retryErr) {
          logger.error(
            "[campaign.service] Could not persist even error-status campaign",
            retryErr,
            { companyId, platform, externalCampaignId },
          );
          throw new ExternalServiceError(
            platform === "meta" ? "Meta Ads" : "Google Ads",
            `Campanha criada na plataforma mas falhou ao salvar no banco: ${dbErr instanceof Error ? dbErr.message : String(dbErr)}`,
          );
        }

        createdCampaigns.push(campaign);
        continue;
      }

      // ------------------------------------------------------------------
      // 5. Write CampaignAuditLog
      // ------------------------------------------------------------------
      try {
        await prisma.campaignAuditLog.create({
          data: {
            companyId,
            campaignId: campaign.id,
            actionType: "campaign_created",
            source: "user",
            newValues: JSON.stringify({
              externalCampaignId,
              externalAdSetId,
              externalAdIds,
              managerUrl,
              platform,
              campaignType,
            }),
          },
        });
      } catch (auditErr) {
        // Audit log failure is non-fatal — log and continue
        logger.error(
          "[campaign.service] Failed to write CampaignAuditLog",
          auditErr,
          { companyId, campaignId: campaign.id },
        );
      }

      logger.info("[campaign.service] Campaign launched", {
        companyId,
        platform,
        campaignId: campaign.id,
        externalCampaignId,
      });

      createdCampaigns.push(campaign);
    }

    return createdCampaigns;
  },

  // ---------------------------------------------------------------------------
  // getPerformanceReport
  // ---------------------------------------------------------------------------

  /**
   * Generates an AI-powered performance report for a campaign over a time period.
   *
   * 1. Verifies the campaign belongs to the given companyId (prevents enumeration).
   * 2. Fetches AdMetricSnapshot records for the period [since, until].
   * 3. Calls AWS Bedrock (Claude) to generate an aiSummary and recommendations.
   * 4. Returns a PerformanceReport object.
   *
   * @throws {NotFoundError} if the campaign does not exist or belongs to another company.
   * @throws {ExternalServiceError} if Bedrock fails.
   */
  async getPerformanceReport(
    companyId: string,
    campaignId: string,
    since: Date,
    until: Date,
  ): Promise<PerformanceReport> {
    // 1. Verify campaign belongs to this company
    const campaign = await prisma.adCampaign.findUnique({
      where: { id: campaignId },
    });

    if (!campaign || campaign.companyId !== companyId) {
      throw new NotFoundError(`Campanha com id '${campaignId}'`);
    }

    // 2. Fetch metric snapshots for the period
    const snapshots = await prisma.adMetricSnapshot.findMany({
      where: {
        campaignId,
        collectedAt: {
          gte: since,
          lte: until,
        },
      },
      orderBy: { collectedAt: "asc" },
    });

    // 3. Build prompt and call Bedrock
    const totalSpend = snapshots.reduce((sum, s) => sum + s.spendBrl, 0);
    const totalConversions = snapshots.reduce((sum, s) => sum + s.conversions, 0);
    const avgRoas =
      snapshots.length > 0
        ? snapshots.reduce((sum, s) => sum + s.roas, 0) / snapshots.length
        : 0;
    const costPerConversion =
      totalConversions > 0 ? totalSpend / totalConversions : 0;

    const systemPrompt = `Você é um especialista em tráfego pago e análise de performance de campanhas digitais.
Analise os dados de performance da campanha fornecidos e gere um relatório em JSON com os campos:
- "aiSummary": um resumo em português da performance da campanha no período, destacando pontos fortes e fracos.
- "recommendations": um array de strings em português com recomendações concretas e acionáveis para melhorar a performance.

Responda APENAS com o JSON, sem markdown, sem texto extra:
{
  "aiSummary": "string",
  "recommendations": ["string", "string", "..."]
}`;

    const userMessage = `Campanha: ${campaign.name}
Plataforma: ${campaign.platform}
Período: ${since.toISOString()} até ${until.toISOString()}
Número de snapshots: ${snapshots.length}

Métricas consolidadas do período:
- Investimento total (BRL): ${totalSpend.toFixed(2)}
- Total de conversões: ${totalConversions}
- Custo por conversão (BRL): ${costPerConversion.toFixed(2)}
- ROAS médio: ${avgRoas.toFixed(2)}

Snapshots detalhados (do mais antigo ao mais recente):
${snapshots
  .map(
    (s) =>
      `  - ${s.collectedAt.toISOString()}: impressões=${s.impressions}, cliques=${s.clicks}, ` +
      `conversões=${s.conversions}, gasto=R$${s.spendBrl.toFixed(2)}, ` +
      `CTR=${(s.ctr * 100).toFixed(2)}%, CPC=R$${s.cpc.toFixed(2)}, ROAS=${s.roas.toFixed(2)}`,
  )
  .join("\n")}

Com base nesses dados, gere um "aiSummary" e uma lista de "recommendations" em português.`;

    let aiSummary: string;
    let recommendations: string[];

    try {
      const result = await generateTextWithBedrock(companyId, systemPrompt, userMessage);

      // generateTextWithBedrock tries to parse JSON from the response
      // The first option's content is the raw text; we need to parse the JSON
      const firstOption = result.options?.[0];
      const rawContent = firstOption?.content ?? "";

      // Try to parse the raw text as JSON (bedrock.ts may have already parsed it)
      let parsed: Record<string, unknown> | null = null;

      // Check if content is already structured (not the raw text fallback)
      if (typeof rawContent === "string") {
        try {
          const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
          }
        } catch {
          // Fallback below
        }
      }

      // If bedrock.ts already parsed into options structure, check title/content directly
      if (!parsed && firstOption?.title && firstOption.title !== "Resposta") {
        // Could be that the parsed options map differently; use raw content as summary
        parsed = { aiSummary: rawContent, recommendations: [] };
      }

      if (!parsed) {
        parsed = { aiSummary: rawContent || "Sem dados suficientes para gerar resumo.", recommendations: [] };
      }

      aiSummary =
        typeof parsed["aiSummary"] === "string"
          ? parsed["aiSummary"]
          : "Sem dados suficientes para gerar resumo.";

      recommendations = Array.isArray(parsed["recommendations"])
        ? (parsed["recommendations"] as string[]).filter((r) => typeof r === "string")
        : [];

      logger.info("[campaign.service] Performance report generated", {
        companyId,
        campaignId,
        snapshotsCount: snapshots.length,
        model: result.usage.model,
        costUsd: result.usage.costUsd,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("[campaign.service] Bedrock call failed for performance report", {
        error: message,
        companyId,
        campaignId,
      });
      throw new ExternalServiceError("AWS Bedrock", message);
    }

    return { campaign, snapshots, aiSummary, recommendations };
  },

  // ---------------------------------------------------------------------------
  // listByCompany
  // ---------------------------------------------------------------------------

  /**
   * Returns a paginated list of campaigns for a company, each enriched with
   * its most recent metric snapshot.
   *
   * @param companyId  — the company whose campaigns to list
   * @param options    — optional page, pageSize and status filter
   */
  async listByCompany(
    companyId: string,
    options?: { page?: number; pageSize?: number; status?: string },
  ): Promise<{
    data: AdCampaignWithLatestMetrics[];
    total: number;
    page: number;
    pageSize: number;
    hasNextPage: boolean;
  }> {
    const page = Math.max(1, options?.page ?? 1);
    const pageSize = Math.max(1, Math.min(100, options?.pageSize ?? 20));
    const skip = (page - 1) * pageSize;

    const where = {
      companyId,
      ...(options?.status ? { status: options.status } : {}),
    };

    const [total, campaigns] = await Promise.all([
      prisma.adCampaign.count({ where }),
      prisma.adCampaign.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        include: {
          metrics: {
            orderBy: { collectedAt: "desc" },
            take: 1,
          },
        },
      }),
    ]);

    const data: AdCampaignWithLatestMetrics[] = campaigns.map((c) => {
      const { metrics, ...rest } = c;
      return {
        ...rest,
        latestMetrics: metrics[0] ?? null,
      };
    });

    return {
      data,
      total,
      page,
      pageSize,
      hasNextPage: skip + pageSize < total,
    };
  },
};
