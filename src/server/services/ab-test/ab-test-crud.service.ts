/**
 * ab-test-crud.service.ts
 * CRUD operations and orchestration for A/B tests.
 */

import { prisma } from "@server/lib/prisma";
import { generateTextWithBedrock } from "@server/lib/bedrock";
import { ExternalServiceError, NotFoundError } from "@server/lib/errors";
import { logger } from "@server/lib/logger";
import type { AbTest } from "@prisma/client";
import type { DecryptedCredential } from "@server/services/credential.service";
import type { AbTestVariation, AbTestResult, AdCreative, VariationMetrics } from "./ab-test.types";
import { buildCreativeVariationSystemPrompt, buildCreativeVariationUserMessage, parseCreativeVariations, buildResultSummary } from "./ab-test-prompts";
import { selectWinner, evaluateTest } from "./ab-test-analysis.service";
import { createMetaAdVariation, createGoogleAdVariation, pauseLoserAds } from "./ab-test-executor.service";

export async function createVariations(
  companyId: string,
  campaignId: string,
  originalCreative: AdCreative,
  creds: DecryptedCredential,
): Promise<AbTest> {
  const campaign = await prisma.adCampaign.findUnique({
    where: { id: campaignId },
    select: { id: true, companyId: true, platform: true, externalAdSetId: true },
  });

  if (!campaign || campaign.companyId !== companyId) {
    throw new NotFoundError(`Campanha com id '${campaignId}'`);
  }

  // Generate 3 variations via Bedrock
  const systemPrompt = buildCreativeVariationSystemPrompt();
  const userMessage = buildCreativeVariationUserMessage(originalCreative);

  let rawVariations;
  try {
    const result = await generateTextWithBedrock(companyId, systemPrompt, userMessage);
    const rawText = result.options?.[0]?.content ?? "";
    rawVariations = parseCreativeVariations(rawText);
    logger.info("[ab-test] Variations generated", { campaignId, model: result.usage.model });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new ExternalServiceError("AWS Bedrock", message);
  }

  // Create ads on platform
  const platform = campaign.platform as "meta" | "google";
  const adSetId = campaign.externalAdSetId ?? "";
  const externalAdIds: string[] = [];

  for (let i = 0; i < rawVariations.length; i++) {
    const variation = rawVariations[i]!;
    let externalAdId: string;
    if (platform === "meta") {
      externalAdId = await createMetaAdVariation(creds, adSetId, variation, i + 1);
    } else {
      externalAdId = await createGoogleAdVariation(creds, adSetId, variation, i + 1);
    }
    externalAdIds.push(externalAdId);
  }

  // Persist AbTest record
  const variationsJson: AbTestVariation[] = rawVariations.map((v, i) => ({
    externalAdId: externalAdIds[i]!,
    variationIndex: i + 1,
    creative: { headline: v.headline, description: v.description, callToAction: v.callToAction },
    impressions: 0,
    clicks: 0,
    ctr: 0,
    isWinner: false,
  }));

  const abTest = await prisma.abTest.create({
    data: {
      campaignId,
      status: "active",
      variationsJson: JSON.stringify(variationsJson),
    },
  });

  logger.info("[ab-test] AbTest created", { testId: abTest.id, campaignId, variationCount: rawVariations.length });
  return abTest;
}

export async function checkAndFinalize(
  test: AbTest,
  currentMetrics: VariationMetrics[],
  creds: DecryptedCredential,
): Promise<AbTestResult | null> {
  const decision = evaluateTest(test, currentMetrics);

  if (decision.action === "too_early") {
    logger.info("[ab-test] Too early to evaluate", { testId: test.id });
    return null;
  }

  if (decision.action === "extend") {
    logger.info("[ab-test] Extending test", { testId: test.id, reason: decision.reason });
    return null;
  }

  // Finalize
  const storedVariations = JSON.parse(test.variationsJson as string) as AbTestVariation[];
  const enrichedVariations: AbTestVariation[] = storedVariations.map((v) => {
    const metrics = currentMetrics.find((m) => m.externalAdId === v.externalAdId);
    return {
      ...v,
      impressions: metrics?.impressions ?? v.impressions,
      clicks: metrics?.clicks ?? v.clicks,
      ctr: metrics?.ctr ?? v.ctr,
    };
  });

  const winner = selectWinner(enrichedVariations);
  const finalVariations = enrichedVariations.map((v) => ({
    ...v,
    isWinner: v.externalAdId === winner.externalAdId,
  }));

  // Pause losers
  const platform = (await prisma.adCampaign.findUnique({ where: { id: test.campaignId }, select: { platform: true } }))?.platform as "meta" | "google" | undefined;
  if (platform) {
    const loserIds = finalVariations.filter((v) => !v.isWinner).map((v) => v.externalAdId);
    await pauseLoserAds(creds, platform, loserIds);
  }

  // Update DB
  const endedAt = new Date();
  const summary = buildResultSummary(winner, finalVariations, decision.reason);
  await prisma.abTest.update({
    where: { id: test.id },
    data: {
      status: "completed",
      winnerAdId: winner.externalAdId,
      variationsJson: JSON.stringify(finalVariations),
      resultSummary: summary,
      endedAt,
    },
  });

  logger.info("[ab-test] Test finalized", { testId: test.id, reason: decision.reason, winnerId: winner.externalAdId });

  return {
    testId: test.id,
    campaignId: test.campaignId,
    winner,
    allVariations: finalVariations,
    endedAt,
    reason: decision.reason,
    summary,
  };
}
