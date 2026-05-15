/**
 * ab-test.service.ts
 *
 * A/B test service for ad creatives.
 *
 * Responsible for:
 *  - Generating 3 distinct creative variations via AWS Bedrock (Claude)
 *  - Creating the variation ads on Meta or Google via the appropriate connector
 *  - Persisting AbTest records to Prisma
 *  - Evaluating running tests and finalizing them (winner selection, loser pausing)
 */

import { prisma } from "@server/lib/prisma";
import { generateTextWithBedrock } from "@server/lib/bedrock";
import { metaAdsConnector } from "@server/lib/meta-ads.connector";
import { googleAdsConnector } from "@server/lib/google-ads.connector";
import { ExternalServiceError, NotFoundError } from "@server/lib/errors";
import { logger } from "@server/lib/logger";
import type { AbTest } from "@prisma/client";
import type { DecryptedCredential } from "@server/services/credential.service";

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

export interface AdCreative {
  imageUrl?: string;
  headline: string;
  description: string;
  callToAction: string;
}

export interface AbTestVariation {
  externalAdId: string;
  variationIndex: number; // 1, 2, or 3
  creative: AdCreative;
  impressions: number;
  clicks: number;
  ctr: number;
  isWinner: boolean;
}

export interface AbTestResult {
  testId: string;
  campaignId: string;
  winner: AbTestVariation;
  allVariations: AbTestVariation[];
  endedAt: Date;
  reason: "completed" | "timeout";
  summary: string;
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

/** Shape of variations stored/returned by Bedrock for creative generation */
interface RawCreativeVariation {
  headline: string;
  description: string;
  callToAction: string;
}

/** Metrics keyed by externalAdId, provided by the caller (monitor/scheduler) */
export interface VariationMetrics {
  externalAdId: string;
  impressions: number;
  clicks: number;
  ctr: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MIN_HOURS_FOR_COMPLETION = 48;
const MAX_DAYS_FOR_TIMEOUT = 7;
const MIN_IMPRESSIONS_PER_VARIATION = 100;
const EXTENSION_HOURS = 24;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const abTestService = {
  // -------------------------------------------------------------------------
  // selectWinner — pure function
  // -------------------------------------------------------------------------

  /**
   * Selects the variation with the highest CTR.
   * Pure function — no side effects.
   *
   * @throws {Error} if variations array is empty.
   */
  selectWinner(variations: AbTestVariation[]): AbTestVariation {
    if (variations.length === 0) {
      throw new Error("Cannot select a winner from an empty variations array.");
    }

    return variations.reduce((best, current) =>
      current.ctr > best.ctr ? current : best,
    );
  },

  // -------------------------------------------------------------------------
  // createVariations
  // -------------------------------------------------------------------------

  /**
   * Generates 3 distinct ad creative variations via AWS Bedrock (Claude),
   * creates the corresponding ads on the campaign's platform, and persists the
   * AbTest record with status 'active'.
   *
   * Steps:
   *  1. Look up the AdCampaign (platform + externalAdSetId)
   *  2. Call Bedrock to generate 3 creative variations (JSON)
   *  3. For each variation, create an ad via the appropriate connector
   *  4. Persist AbTest record with variationsJson
   *
   * @returns The newly created AbTest record.
   * @throws {NotFoundError} if the campaign does not exist.
   * @throws {ExternalServiceError} if Bedrock or the ad platform API fails.
   */
  async createVariations(
    companyId: string,
    campaignId: string,
    originalCreative: AdCreative,
    creds: DecryptedCredential,
  ): Promise<AbTest> {
    // ------------------------------------------------------------------
    // 1. Look up the campaign
    // ------------------------------------------------------------------
    const campaign = await prisma.adCampaign.findUnique({
      where: { id: campaignId },
      select: {
        id: true,
        platform: true,
        externalAdSetId: true,
        objective: true,
      },
    });

    if (!campaign) {
      throw new NotFoundError(`Campanha com id '${campaignId}'`);
    }

    const { platform, externalAdSetId } = campaign;

    if (!externalAdSetId) {
      throw new ExternalServiceError(
        "A/B Test",
        `Campanha '${campaignId}' não possui externalAdSetId — não é possível criar variações.`,
      );
    }

    // ------------------------------------------------------------------
    // 2. Generate 3 creative variations via Bedrock
    // ------------------------------------------------------------------
    const systemPrompt = buildCreativeVariationSystemPrompt();
    const userMessage = buildCreativeVariationUserMessage(originalCreative);

    let rawText: string;
    try {
      const result = await generateTextWithBedrock(
        companyId,
        systemPrompt,
        userMessage,
      );
      rawText = result.options?.[0]?.content ?? "";

      logger.info("[ab-test] Bedrock creative variations response received", {
        campaignId,
        model: result.usage.model,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("[ab-test] Bedrock call failed during createVariations", err, {
        companyId,
        campaignId,
      });
      throw new ExternalServiceError("AWS Bedrock", message);
    }

    // Parse JSON array from Claude's response
    const parsedVariations = parseCreativeVariations(rawText);

    // ------------------------------------------------------------------
    // 3. Create ads on the platform for each variation
    // ------------------------------------------------------------------
    const abTestVariations: AbTestVariation[] = [];

    for (let i = 0; i < parsedVariations.length; i++) {
      const variation = parsedVariations[i];
      if (!variation) continue; // should never happen — parseCreativeVariations validates 3 entries
      const variationIndex = i + 1; // 1, 2, or 3

      let externalAdId: string;

      try {
        if (platform === "meta") {
          externalAdId = await createMetaAdVariation(
            creds,
            externalAdSetId,
            variation,
            variationIndex,
          );
        } else {
          externalAdId = await createGoogleAdVariation(
            creds,
            externalAdSetId,
            variation,
            variationIndex,
          );
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error("[ab-test] Failed to create ad variation on platform", err, {
          companyId,
          campaignId,
          platform,
          variationIndex,
        });
        throw new ExternalServiceError(
          platform === "meta" ? "Meta Ads" : "Google Ads",
          `Falha ao criar variação ${variationIndex}: ${message}`,
        );
      }

      abTestVariations.push({
        externalAdId,
        variationIndex,
        creative: {
          headline: variation.headline,
          description: variation.description,
          callToAction: variation.callToAction,
        },
        impressions: 0,
        clicks: 0,
        ctr: 0,
        isWinner: false,
      });

      logger.info("[ab-test] Ad variation created", {
        campaignId,
        platform,
        variationIndex,
        externalAdId,
      });
    }

    // ------------------------------------------------------------------
    // 4. Persist AbTest record
    // ------------------------------------------------------------------
    const abTest = await prisma.abTest.create({
      data: {
        campaignId,
        status: "active",
        variationsJson: JSON.stringify(abTestVariations),
        startedAt: new Date(),
      },
    });

    logger.info("[ab-test] AbTest created", {
      companyId,
      campaignId,
      testId: abTest.id,
      variationsCount: abTestVariations.length,
    });

    return abTest;
  },

  // -------------------------------------------------------------------------
  // checkAndFinalize
  // -------------------------------------------------------------------------

  /**
   * Evaluates a running A/B test and finalizes it if conditions are met.
   *
   * Decision logic:
   *  - Parse variationsJson from the test record
   *  - Merge currentMetrics into each variation
   *  - If < 48h since startedAt → return null (too early)
   *  - If ≥ 48h AND all 3 variations have ≥ 100 impressions → finalize (reason: 'completed')
   *  - If ≥ 48h but NOT all have 100 impressions:
   *    - If > 7 days since startedAt → finalize as timeout with best CTR winner
   *    - Otherwise → extend by 24h (increment extensionCount, update endedAt), return null
   *
   * When finalizing:
   *  - Call selectWinner
   *  - Pause the 2 losing ads via the platform connector
   *  - Update AbTest record (status, winnerAdId, endedAt, resultSummary)
   *  - Return AbTestResult
   *
   * @returns AbTestResult if the test was finalized, null if still running.
   * @throws {ExternalServiceError} if pausing losing ads on the platform fails.
   */
  async checkAndFinalize(
    test: AbTest,
    currentMetrics: VariationMetrics[],
    creds: DecryptedCredential,
  ): Promise<AbTestResult | null> {
    // ------------------------------------------------------------------
    // Parse stored variations
    // ------------------------------------------------------------------
    let variations: AbTestVariation[];
    try {
      variations = JSON.parse(test.variationsJson) as AbTestVariation[];
    } catch (err) {
      logger.error("[ab-test] Failed to parse variationsJson", err, {
        testId: test.id,
      });
      throw new Error(
        `AbTest ${test.id}: variationsJson is not valid JSON — ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // Merge current metrics into variations (update impressions, clicks, ctr)
    const mergedVariations: AbTestVariation[] = variations.map((v) => {
      const metrics = currentMetrics.find(
        (m) => m.externalAdId === v.externalAdId,
      );
      if (metrics) {
        return {
          ...v,
          impressions: metrics.impressions,
          clicks: metrics.clicks,
          ctr: metrics.ctr,
        };
      }
      return v;
    });

    const now = new Date();
    const startedAt = test.startedAt;
    const hoursSinceStart =
      (now.getTime() - startedAt.getTime()) / (1000 * 60 * 60);
    const daysSinceStart = hoursSinceStart / 24;

    // ------------------------------------------------------------------
    // Check 48h minimum threshold
    // ------------------------------------------------------------------
    if (hoursSinceStart < MIN_HOURS_FOR_COMPLETION) {
      logger.info("[ab-test] Test has not reached 48h threshold yet", {
        testId: test.id,
        hoursSinceStart: hoursSinceStart.toFixed(1),
      });
      return null;
    }

    const allHaveMinImpressions = mergedVariations.every(
      (v) => v.impressions >= MIN_IMPRESSIONS_PER_VARIATION,
    );

    // ------------------------------------------------------------------
    // Timeout path: > 7 days without all variations reaching 100 impressions
    // ------------------------------------------------------------------
    if (!allHaveMinImpressions && daysSinceStart > MAX_DAYS_FOR_TIMEOUT) {
      logger.info("[ab-test] Test timed out — finalizing with best available CTR", {
        testId: test.id,
        daysSinceStart: daysSinceStart.toFixed(1),
      });
      return this._finalize(test, mergedVariations, "timeout", creds, now);
    }

    // ------------------------------------------------------------------
    // Extension path: ≥ 48h but not all variations have 100 impressions,
    // and within the 7-day window
    // ------------------------------------------------------------------
    if (!allHaveMinImpressions) {
      const newExtensionCount = test.extensionCount + 1;
      const newEndedAt = new Date(now.getTime() + EXTENSION_HOURS * 60 * 60 * 1000);

      await prisma.abTest.update({
        where: { id: test.id },
        data: {
          extensionCount: newExtensionCount,
          endedAt: newEndedAt,
          status: "extended",
        },
      });

      logger.info("[ab-test] Test extended by 24h", {
        testId: test.id,
        extensionCount: newExtensionCount,
        newEndedAt: newEndedAt.toISOString(),
      });

      return null;
    }

    // ------------------------------------------------------------------
    // Completion path: ≥ 48h AND all variations have ≥ 100 impressions
    // ------------------------------------------------------------------
    logger.info("[ab-test] Test ready for finalization", {
      testId: test.id,
      hoursSinceStart: hoursSinceStart.toFixed(1),
    });

    return this._finalize(test, mergedVariations, "completed", creds, now);
  },

  // -------------------------------------------------------------------------
  // _finalize — internal helper
  // -------------------------------------------------------------------------

  /**
   * Selects a winner, pauses the losing ads, updates the AbTest record and
   * returns the AbTestResult.
   */
  async _finalize(
    test: AbTest,
    variations: AbTestVariation[],
    reason: "completed" | "timeout",
    creds: DecryptedCredential,
    endedAt: Date,
  ): Promise<AbTestResult> {
    // Look up campaign to determine platform
    const campaign = await prisma.adCampaign.findUnique({
      where: { id: test.campaignId },
      select: { id: true, platform: true, companyId: true },
    });

    if (!campaign) {
      throw new NotFoundError(`Campanha com id '${test.campaignId}'`);
    }

    // Select winner
    const winner = this.selectWinner(variations);

    // Mark winner in variations array
    const finalVariations: AbTestVariation[] = variations.map((v) => ({
      ...v,
      isWinner: v.externalAdId === winner.externalAdId,
    }));

    // Pause losing ads
    const losers = finalVariations.filter(
      (v) => v.externalAdId !== winner.externalAdId,
    );

    for (const loser of losers) {
      try {
        if (campaign.platform === "meta") {
          await metaAdsConnector.pauseAd(creds, loser.externalAdId);
        } else {
          await googleAdsConnector.pauseAd(creds, loser.externalAdId);
        }
        logger.info("[ab-test] Losing ad paused", {
          testId: test.id,
          campaignId: test.campaignId,
          platform: campaign.platform,
          externalAdId: loser.externalAdId,
          variationIndex: loser.variationIndex,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error("[ab-test] Failed to pause losing ad", err, {
          testId: test.id,
          externalAdId: loser.externalAdId,
        });
        throw new ExternalServiceError(
          campaign.platform === "meta" ? "Meta Ads" : "Google Ads",
          `Falha ao pausar anúncio perdedor ${loser.externalAdId}: ${message}`,
        );
      }
    }

    // Build summary
    const summary = buildResultSummary(winner, finalVariations, reason);

    // Persist final state
    await prisma.abTest.update({
      where: { id: test.id },
      data: {
        status: reason === "timeout" ? "timeout" : "completed",
        winnerAdId: winner.externalAdId,
        endedAt,
        resultSummary: summary,
        variationsJson: JSON.stringify(finalVariations),
      },
    });

    logger.info("[ab-test] AbTest finalized", {
      testId: test.id,
      campaignId: test.campaignId,
      reason,
      winnerAdId: winner.externalAdId,
      winnerCtr: winner.ctr,
    });

    return {
      testId: test.id,
      campaignId: test.campaignId,
      winner,
      allVariations: finalVariations,
      endedAt,
      reason,
      summary,
    };
  },
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * System prompt that instructs Claude to generate 3 distinct ad creative
 * variations as a JSON array.
 */
function buildCreativeVariationSystemPrompt(): string {
  return `Você é um especialista em copywriting para anúncios pagos.
Gere exatamente 3 variações distintas de criativo publicitário em formato JSON.
Cada variação deve ter headline, description e callToAction meaningfully diferentes entre si e do original.
As variações devem testar ângulos diferentes: ex. benefício principal, prova social, urgência.

RESPONDA APENAS com um array JSON no formato:
[
  { "headline": "string", "description": "string", "callToAction": "string" },
  { "headline": "string", "description": "string", "callToAction": "string" },
  { "headline": "string", "description": "string", "callToAction": "string" }
]

Sem markdown, sem texto extra — apenas o array JSON.`;
}

/**
 * User message with the original creative for variation generation.
 */
function buildCreativeVariationUserMessage(original: AdCreative): string {
  return `Crie 3 variações distintas do seguinte criativo original para teste A/B:

Headline original: ${original.headline}
Description original: ${original.description}
Call to Action original: ${original.callToAction}

Gere 3 variações que testem ângulos diferentes e sejam meaningfully diferentes do original e entre si.`;
}

/**
 * Parses the Bedrock response text into an array of RawCreativeVariation.
 * Falls back to extracting a JSON array from markdown fences or raw text.
 *
 * @throws {Error} if parsing fails or fewer than 3 variations are returned.
 */
function parseCreativeVariations(rawText: string): RawCreativeVariation[] {
  let parsed: unknown;

  try {
    // Try direct parse first
    const trimmed = rawText.trim();
    if (trimmed.startsWith("[")) {
      parsed = JSON.parse(trimmed);
    } else {
      // Extract JSON array from the text
      const match = rawText.match(/\[[\s\S]*\]/);
      if (!match) {
        throw new Error(
          `Nenhum array JSON encontrado na resposta. Conteúdo: ${rawText.slice(0, 300)}`,
        );
      }
      parsed = JSON.parse(match[0]);
    }
  } catch (err) {
    throw new Error(
      `Falha ao parsear variações de criativo do Bedrock: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error("Resposta do Bedrock não é um array JSON.");
  }

  const variations = parsed as RawCreativeVariation[];

  if (variations.length < 3) {
    throw new Error(
      `Bedrock retornou apenas ${variations.length} variação(ões); eram esperadas 3.`,
    );
  }

  // Validate each entry has required fields
  for (let i = 0; i < 3; i++) {
    const v: RawCreativeVariation | undefined = variations[i];
    if (
      !v ||
      typeof v.headline !== "string" ||
      typeof v.description !== "string" ||
      typeof v.callToAction !== "string"
    ) {
      throw new Error(
        `Variação ${i + 1} está incompleta — campos obrigatórios ausentes (headline, description, callToAction).`,
      );
    }
  }

  // Return only the first 3 variations
  return variations.slice(0, 3);
}

/**
 * Creates a Meta ad for a creative variation within the given Ad Set.
 * Returns the externalAdId of the created ad.
 */
async function createMetaAdVariation(
  creds: DecryptedCredential,
  externalAdSetId: string,
  variation: RawCreativeVariation,
  variationIndex: number,
): Promise<string> {
  const { accessToken, adAccountId } = creds.fields;

  if (!accessToken || !adAccountId) {
    throw new ExternalServiceError(
      "Meta Ads",
      "accessToken ou adAccountId ausente nas credenciais.",
    );
  }

  const accountId = adAccountId.startsWith("act_")
    ? adAccountId
    : `act_${adAccountId}`;

  // Use the meta connector's callMeta-equivalent via fetch directly,
  // since callMeta is not exported. We replicate the minimal API calls needed.
  const META_API_BASE = "https://graph.facebook.com/v21.0";

  // Step 1 — Create AdCreative
  const creativeBody = new URLSearchParams({
    name: `AB Test Variation ${variationIndex}`.slice(0, 255),
    object_story_spec: JSON.stringify({
      page_id: accountId,
      link_data: {
        message: variation.description,
        link: "https://example.com",
        name: variation.headline,
        description: variation.callToAction,
      },
    }),
    access_token: accessToken,
  });

  let creativeId: string;
  {
    const res = await fetch(`${META_API_BASE}/${accountId}/adcreatives`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: creativeBody.toString(),
    });
    const json = (await res.json()) as Record<string, unknown>;
    if (json.error) {
      const apiErr = json.error as Record<string, unknown>;
      throw new ExternalServiceError(
        "Meta Ads",
        `Falha ao criar criativo para variação ${variationIndex}: ${typeof apiErr.message === "string" ? apiErr.message : JSON.stringify(apiErr)}`,
      );
    }
    creativeId = json.id as string;
  }

  // Step 2 — Create Ad within the existing Ad Set
  const adBody = new URLSearchParams({
    name: `AB Test Variation ${variationIndex}`.slice(0, 255),
    adset_id: externalAdSetId,
    creative: JSON.stringify({ creative_id: creativeId }),
    status: "ACTIVE",
    access_token: accessToken,
  });

  let externalAdId: string;
  {
    const res = await fetch(`${META_API_BASE}/${accountId}/ads`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: adBody.toString(),
    });
    const json = (await res.json()) as Record<string, unknown>;
    if (json.error) {
      const apiErr = json.error as Record<string, unknown>;
      throw new ExternalServiceError(
        "Meta Ads",
        `Falha ao criar anúncio para variação ${variationIndex}: ${typeof apiErr.message === "string" ? apiErr.message : JSON.stringify(apiErr)}`,
      );
    }
    externalAdId = json.id as string;
  }

  return externalAdId;
}

/**
 * Creates a Google ad for a creative variation within the given Ad Group.
 * Returns the externalAdId (resource name) of the created ad.
 *
 * NOTE: This is a stub that follows the same pattern as googleAdsConnector.
 * Full implementation requires Google credentials to be provisioned.
 */
async function createGoogleAdVariation(
  creds: DecryptedCredential,
  externalAdGroupId: string,
  variation: RawCreativeVariation,
  variationIndex: number,
): Promise<string> {
  const { developerToken, clientId, clientSecret, refreshToken, customerId } =
    creds.fields;

  if (
    !developerToken ||
    !clientId ||
    !clientSecret ||
    !refreshToken ||
    !customerId
  ) {
    throw new ExternalServiceError(
      "Google Ads",
      `Credenciais incompletas para criar variação ${variationIndex}.`,
    );
  }

  logger.info("[ab-test] createGoogleAdVariation — intended operation", {
    customerId,
    externalAdGroupId,
    variationIndex,
    headline: variation.headline,
  });

  // Stub: Google Ads RSA creation for A/B test variation.
  // Full implementation:
  //   POST /customers/{customerId}/adGroupAds:mutate
  //   body: { operations: [{ create: { adGroup: externalAdGroupId,
  //           ad: { responsiveSearchAd: {
  //             headlines: [{ text: variation.headline }],
  //             descriptions: [{ text: variation.description }, { text: variation.callToAction }]
  //           }, finalUrls: ["https://example.com"] } } }] }
  throw new ExternalServiceError(
    "Google Ads",
    `A criação de variações A/B para Google Ads será habilitada quando as credenciais forem configuradas. ` +
      `Variação ${variationIndex}: "${variation.headline}"`,
  );
}

/**
 * Builds a human-readable summary of the A/B test result.
 */
function buildResultSummary(
  winner: AbTestVariation,
  allVariations: AbTestVariation[],
  reason: "completed" | "timeout",
): string {
  const reasonLabel =
    reason === "completed"
      ? "Teste concluído com dados suficientes"
      : "Teste encerrado por timeout (7 dias)";

  const variationDetails = allVariations
    .map(
      (v) =>
        `Variação ${v.variationIndex}: ${v.impressions} impressões, ${v.clicks} cliques, CTR ${(v.ctr * 100).toFixed(2)}%${v.isWinner ? " ✓ VENCEDORA" : ""}`,
    )
    .join(" | ");

  return (
    `${reasonLabel}. ` +
    `Vencedora: Variação ${winner.variationIndex} com CTR de ${(winner.ctr * 100).toFixed(2)}% ` +
    `(${winner.impressions} impressões, ${winner.clicks} cliques). ` +
    `Headline: "${winner.creative.headline}". ` +
    `Detalhes: ${variationDetails}.`
  );
}
