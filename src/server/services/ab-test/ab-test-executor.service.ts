/**
 * ab-test-executor.service.ts
 * Platform execution: creating ad variations and pausing losers.
 */

import { metaAdsConnector } from "@server/lib/meta-ads.connector";
import { googleAdsConnector } from "@server/lib/google-ads.connector";
import { ExternalServiceError } from "@server/lib/errors";
import { logger } from "@server/lib/logger";
import type { DecryptedCredential } from "@server/services/credential.service";
import type { RawCreativeVariation } from "./ab-test.types";

export async function createMetaAdVariation(
  _creds: DecryptedCredential,
  _adSetId: string,
  _variation: RawCreativeVariation,
  _index: number,
): Promise<string> {
  // Meta ad creation for A/B tests requires Graph API calls not yet exposed
  // via metaAdsConnector. This will be implemented when the connector is extended.
  throw new ExternalServiceError(
    "Meta Ads",
    "A/B test ad creation for Meta Ads requires connector extension.",
  );
}

export async function createGoogleAdVariation(
  _creds: DecryptedCredential,
  _adGroupId: string,
  _variation: RawCreativeVariation,
  _index: number,
): Promise<string> {
  throw new ExternalServiceError(
    "Google Ads",
    "A/B test ad creation for Google Ads is not yet implemented.",
  );
}

export async function pauseLoserAds(
  creds: DecryptedCredential,
  platform: "meta" | "google",
  externalAdIds: string[],
): Promise<void> {
  for (const adId of externalAdIds) {
    try {
      if (platform === "meta") {
        await metaAdsConnector.pauseAd(creds, adId);
      } else {
        await googleAdsConnector.pauseAd(creds, adId);
      }
    } catch (err) {
      logger.error("[ab-test] Failed to pause loser ad", { adId, platform, error: err instanceof Error ? err.message : String(err) });
    }
  }
}
