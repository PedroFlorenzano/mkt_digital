/**
 * google-ads.connector.ts
 *
 * Connector for the Google Ads API v19 (REST/fetch — no external SDK).
 *
 * IMPORTANT: This is a functional stub.
 * - `validateCredentials` performs real OAuth2 token exchange + customer lookup.
 * - All other methods log the intended operation and throw ExternalServiceError
 *   when required credentials are missing, allowing the rest of the platform to
 *   operate before Google Ads credentials are provisioned by the user.
 * - The full Google Ads API integration (campaign creation, metrics collection,
 *   etc.) will be completed once users connect their Google Ads accounts.
 *
 * Authentication:
 *   Google Ads REST API requires a Bearer access token obtained from the
 *   OAuth2 refresh token flow (POST https://oauth2.googleapis.com/token).
 *   Every method that talks to the Ads API must first exchange the stored
 *   refresh token for a short-lived access token.
 *
 * REST base URL: https://googleads.googleapis.com/v19
 */

import { ExternalServiceError } from "@server/lib/errors";
import { logger } from "@server/lib/logger";
import type { DecryptedCredential } from "@server/services/credential.service";
import type { CampaignDraft } from "@server/services/campaign.service";

// ---------------------------------------------------------------------------
// Local types (shared shape with meta-ads.connector.ts)
// ---------------------------------------------------------------------------

export interface ValidationResult {
  valid: boolean;
  error?: string;
  invalidFields?: string[];
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface GoogleCampaignResult {
  externalCampaignId: string;
  externalAdGroupId: string;
  externalAdIds: string[];
  managerUrl: string;
}

export interface AdMetrics {
  impressions: number;
  clicks: number;
  conversions: number;
  spendBrl: number;
  ctr: number;
  cpc: number;
  roas: number;
  rawJson: string;
}

// ---------------------------------------------------------------------------
// Internal constants
// ---------------------------------------------------------------------------

const GOOGLE_ADS_REST_BASE = "https://googleads.googleapis.com/v19";
const GOOGLE_OAUTH2_TOKEN_URL = "https://oauth2.googleapis.com/token";
const REQUEST_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Extracts the required Google credentials fields from a DecryptedCredential.
 * Throws ExternalServiceError with a descriptive message if any required field
 * is absent so callers always get an actionable error.
 */
function extractGoogleCreds(creds: DecryptedCredential): {
  developerToken: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  customerId: string;
} {
  const { fields } = creds;
  const required = [
    "developerToken",
    "clientId",
    "clientSecret",
    "refreshToken",
    "customerId",
  ] as const;

  const missing = required.filter((k) => !fields[k]);
  if (missing.length > 0) {
    throw new ExternalServiceError(
      "Google Ads",
      `Credenciais incompletas. Campos ausentes: ${missing.join(", ")}. ` +
        "Configure suas credenciais em Configurações → Tráfego Pago → Google Ads.",
    );
  }

  return {
    developerToken: fields.developerToken!,
    clientId: fields.clientId!,
    clientSecret: fields.clientSecret!,
    refreshToken: fields.refreshToken!,
    customerId: fields.customerId!,
  };
}

/**
 * Exchanges a refresh token for a short-lived OAuth2 access token.
 * Uses native fetch with a 10-second AbortController timeout.
 *
 * @throws {ExternalServiceError} on network failure or non-200 response from
 *   the OAuth2 token endpoint.
 */
async function getAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(GOOGLE_OAUTH2_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
      }).toString(),
      signal: controller.signal,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("[google-ads] OAuth2 token exchange failed (network)", err, {
      endpoint: GOOGLE_OAUTH2_TOKEN_URL,
    });
    throw new ExternalServiceError(
      "Google Ads OAuth2",
      `Falha de rede ao obter access token: ${msg}`,
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    let body = "";
    try {
      body = await response.text();
    } catch {
      // ignore body parsing errors
    }
    logger.error("[google-ads] OAuth2 token exchange returned non-200", undefined, {
      status: response.status,
      body: body.slice(0, 500),
    });
    throw new ExternalServiceError(
      "Google Ads OAuth2",
      `Falha ao obter access token: HTTP ${response.status}. Verifique clientId, clientSecret e refreshToken.`,
    );
  }

  const data = (await response.json()) as Record<string, unknown>;
  const accessToken = data.access_token;
  if (typeof accessToken !== "string" || !accessToken) {
    throw new ExternalServiceError(
      "Google Ads OAuth2",
      "Resposta da API de token não contém access_token válido.",
    );
  }

  return accessToken;
}

/**
 * Performs a GET request against the Google Ads REST API with:
 *  - Bearer token authorization
 *  - developer-token header
 *  - 10-second AbortController timeout
 *
 * Returns the parsed JSON body on HTTP 2xx, or throws ExternalServiceError.
 */
async function googleAdsGet(
  path: string,
  accessToken: string,
  developerToken: string,
): Promise<unknown> {
  const url = `${GOOGLE_ADS_REST_BASE}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "developer-token": developerToken,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("[google-ads] GET request failed (network)", err, { url });
    throw new ExternalServiceError("Google Ads API", `Falha de rede: ${msg}`);
  } finally {
    clearTimeout(timer);
  }

  const bodyText = await response.text();

  if (!response.ok) {
    logger.error("[google-ads] GET returned non-2xx", undefined, {
      url,
      status: response.status,
      body: bodyText.slice(0, 500),
    });
    throw new ExternalServiceError(
      "Google Ads API",
      `HTTP ${response.status} ao acessar ${url}: ${bodyText.slice(0, 200)}`,
    );
  }

  try {
    return JSON.parse(bodyText);
  } catch {
    return bodyText;
  }
}

/**
 * Performs a POST (mutate) request against the Google Ads REST API.
 * Same auth, headers and timeout as googleAdsGet.
 *
 * Returns parsed JSON body on success; throws ExternalServiceError on failure.
 */
async function googleAdsPost(
  path: string,
  body: unknown,
  accessToken: string,
  developerToken: string,
): Promise<unknown> {
  const url = `${GOOGLE_ADS_REST_BASE}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "developer-token": developerToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("[google-ads] POST request failed (network)", err, { url });
    throw new ExternalServiceError("Google Ads API", `Falha de rede: ${msg}`);
  } finally {
    clearTimeout(timer);
  }

  const bodyText = await response.text();

  if (!response.ok) {
    logger.error("[google-ads] POST returned non-2xx", undefined, {
      url,
      status: response.status,
      body: bodyText.slice(0, 500),
    });
    throw new ExternalServiceError(
      "Google Ads API",
      `HTTP ${response.status} ao acessar ${url}: ${bodyText.slice(0, 200)}`,
    );
  }

  try {
    return JSON.parse(bodyText);
  } catch {
    return bodyText;
  }
}

// ---------------------------------------------------------------------------
// Match type mapping
// ---------------------------------------------------------------------------

const MATCH_TYPE_MAP: Record<string, string> = {
  broad: "BROAD",
  phrase: "PHRASE",
  exact: "EXACT",
};

// ---------------------------------------------------------------------------
// Connector implementation
// ---------------------------------------------------------------------------

export const googleAdsConnector = {
  /**
   * Validates Google Ads credentials by:
   *  1. Exchanging the refresh token for an access token (OAuth2 flow).
   *  2. Calling GET /customers/{customerId} to verify the customer exists and
   *     the token has the required permissions.
   *
   * Uses AbortController with a 10-second timeout on both calls.
   *
   * @returns {ValidationResult} `{ valid: true }` on success,
   *   `{ valid: false, error }` on any failure (network, auth, etc.).
   */
  async validateCredentials(creds: DecryptedCredential): Promise<ValidationResult> {
    let googleCreds: ReturnType<typeof extractGoogleCreds>;
    try {
      googleCreds = extractGoogleCreds(creds);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn("[google-ads] validateCredentials — missing fields", { message });
      return { valid: false, error: message };
    }

    const { developerToken, clientId, clientSecret, refreshToken, customerId } = googleCreds;

    // Step 1: Exchange refresh token for access token
    let accessToken: string;
    try {
      accessToken = await getAccessToken(clientId, clientSecret, refreshToken);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn("[google-ads] validateCredentials — token exchange failed", { message });
      return { valid: false, error: message };
    }

    // Step 2: Verify customer resource
    // Strip dashes from customer ID (Google accepts both formats, REST requires digits only)
    const cleanCustomerId = customerId.replace(/-/g, "");
    try {
      await googleAdsGet(
        `/customers/${cleanCustomerId}`,
        accessToken,
        developerToken,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn("[google-ads] validateCredentials — customer lookup failed", { message });
      return { valid: false, error: message };
    }

    logger.info("[google-ads] Credentials validated successfully", {
      customerId: cleanCustomerId,
    });
    return { valid: true };
  },

  /**
   * Creates a Google Search campaign for the given draft.
   *
   * Full flow (to be completed when users supply Google credentials):
   *   1. Create Campaign (Search type, MANUAL_CPC bidding, budget in micros)
   *   2. Create Ad Group inside the campaign
   *   3. Add keywords (≥15, mapped from draft.keywords with BROAD/PHRASE/EXACT)
   *   4. Create Responsive Search Ad (RSA) with ≥5 headlines and ≥3 descriptions
   *
   * Currently logs the intended operation and throws ExternalServiceError if
   * credentials are missing or the stub has not been implemented yet.
   *
   * @throws {ExternalServiceError} always in this stub implementation.
   */
  async createSearchCampaign(
    creds: DecryptedCredential,
    draft: CampaignDraft,
  ): Promise<GoogleCampaignResult> {
    // Validate credentials are present (will throw if missing)
    const { developerToken, clientSecret, refreshToken, customerId } =
      extractGoogleCreds(creds);

    const cleanCustomerId = customerId.replace(/-/g, "");

    logger.info("[google-ads] createSearchCampaign — iniciando criação de campanha Search", {
      customerId: cleanCustomerId,
      objective: draft.objective,
      dailyBudgetBrl: draft.dailyBudgetBrl,
      keywordsCount: draft.keywords?.length ?? 0,
    });

    // Convert BRL to micros (1 BRL = 1,000,000 micros)
    const dailyBudgetMicros = Math.round(draft.dailyBudgetBrl * 1_000_000);

    // Map keywords to Google Ads match types
    const keywords = (draft.keywords ?? []).map((kw) => ({
      text: kw.text,
      matchType: MATCH_TYPE_MAP[kw.matchType] ?? "BROAD",
    }));

    // Find RSA ad copy (Google Search RSA placement)
    const rsaCopy = draft.adCopies.find(
      (c) => c.placement.toLowerCase().includes("google") ||
             c.placement.toLowerCase().includes("search") ||
             c.placement.toLowerCase().includes("rsa"),
    );
    const headlines = rsaCopy?.headlines ?? draft.adCopies[0]?.variations.slice(0, 5) ?? [];
    const descriptions = rsaCopy?.descriptions ?? draft.adCopies[0]?.variations.slice(0, 3) ?? [];

    logger.info("[google-ads] createSearchCampaign — parâmetros preparados", {
      customerId: cleanCustomerId,
      dailyBudgetMicros,
      keywordsMapped: keywords.length,
      headlinesCount: headlines.length,
      descriptionsCount: descriptions.length,
    });

    // TODO: Full implementation — to be completed when users provide Google credentials.
    // The sequence below documents the intended API calls:
    //
    // Step 1 — Create shared budget:
    //   POST /customers/{customerId}/campaignBudgets:mutate
    //   body: { operations: [{ create: { amountMicros: dailyBudgetMicros, deliveryMethod: "STANDARD" } }] }
    //
    // Step 2 — Create Search campaign:
    //   POST /customers/{customerId}/campaigns:mutate
    //   body: { operations: [{ create: { name, advertisingChannelType: "SEARCH",
    //           status: "PAUSED", campaignBudget: budgetResourceName,
    //           manualCpc: { enhancedCpcEnabled: false } } }] }
    //
    // Step 3 — Create Ad Group:
    //   POST /customers/{customerId}/adGroups:mutate
    //   body: { operations: [{ create: { name, campaign: campaignResourceName,
    //           type: "SEARCH_STANDARD", cpcBidMicros: 1_000_000 } }] }
    //
    // Step 4 — Add keywords:
    //   POST /customers/{customerId}/adGroupCriteria:mutate
    //   body: { operations: keywords.map(kw => ({ create: { adGroup, keyword:
    //           { text: kw.text, matchType: kw.matchType } } })) }
    //
    // Step 5 — Create RSA:
    //   POST /customers/{customerId}/adGroupAds:mutate
    //   body: { operations: [{ create: { adGroup, ad: { responsiveSearchAd:
    //           { headlines: headlines.map(h => ({ text: h })),
    //             descriptions: descriptions.map(d => ({ text: d })) },
    //           finalUrls: [landingPage] } } }] }
    //
    // Extract resource names from responses and build managerUrl:
    //   https://ads.google.com/aw/campaigns?campaignId={campaignId}&ocid={customerId}

    // Suppress unused variable warnings for the stub
    void developerToken;
    void clientSecret;
    void refreshToken;
    void keywords;
    void headlines;
    void descriptions;
    void dailyBudgetMicros;
    void googleAdsPost;

    throw new ExternalServiceError(
      "Google Ads",
      "A criação de campanhas Search será habilitada quando você conectar sua conta Google Ads. " +
        "Acesse Configurações → Tráfego Pago → Google Ads para configurar suas credenciais.",
    );
  },

  /**
   * Creates a Google Display campaign for the given draft.
   *
   * Full flow (to be completed when users supply Google credentials):
   *   1. Create Display Campaign (DISPLAY channel type, target CPA/maximize conversions)
   *   2. Create Ad Group (DISPLAY_STANDARD type)
   *   3. Create Responsive Display Ad with assets from draft (headlines, descriptions,
   *      marketing images and logo images)
   *
   * Currently logs the intended operation and throws ExternalServiceError.
   *
   * @throws {ExternalServiceError} always in this stub implementation.
   */
  async createDisplayCampaign(
    creds: DecryptedCredential,
    draft: CampaignDraft,
  ): Promise<GoogleCampaignResult> {
    const { customerId } = extractGoogleCreds(creds);
    const cleanCustomerId = customerId.replace(/-/g, "");

    logger.info("[google-ads] createDisplayCampaign — iniciando criação de campanha Display", {
      customerId: cleanCustomerId,
      objective: draft.objective,
      dailyBudgetBrl: draft.dailyBudgetBrl,
    });

    // TODO: Full implementation — to be completed when users provide Google credentials.
    // The sequence below documents the intended API calls:
    //
    // Step 1 — Create shared budget (same as Search)
    //
    // Step 2 — Create Display campaign:
    //   POST /customers/{customerId}/campaigns:mutate
    //   body: { operations: [{ create: { name, advertisingChannelType: "DISPLAY",
    //           status: "PAUSED", campaignBudget: budgetResourceName,
    //           targetCpa: { targetCpaMicros: ... } } }] }
    //
    // Step 3 — Create Ad Group (DISPLAY_STANDARD):
    //   POST /customers/{customerId}/adGroups:mutate
    //
    // Step 4 — Upload asset images (headlines from draft, image assets):
    //   POST /customers/{customerId}/assets:mutate
    //   body: { operations: assetOperations }
    //
    // Step 5 — Create Responsive Display Ad:
    //   POST /customers/{customerId}/adGroupAds:mutate
    //   body: { operations: [{ create: { adGroup, ad: { responsiveDisplayAd: {
    //           headlines, longHeadline, descriptions, marketingImages, squareMarketingImages,
    //           logoImages } } } }] }

    throw new ExternalServiceError(
      "Google Ads",
      "A criação de campanhas Display será habilitada quando você conectar sua conta Google Ads. " +
        "Acesse Configurações → Tráfego Pago → Google Ads para configurar suas credenciais.",
    );
  },

  /**
   * Fetches campaign performance metrics for a given period using Google Ads
   * Query Language (GAQL).
   *
   * GAQL query template:
   *   SELECT campaign.id, metrics.impressions, metrics.clicks,
   *          metrics.conversions, metrics.cost_micros, metrics.ctr,
   *          metrics.average_cpc, metrics.all_conversions_value
   *   FROM campaign
   *   WHERE campaign.id = '{campaignId}'
   *     AND segments.date BETWEEN '{since}' AND '{until}'
   *
   * @throws {ExternalServiceError} if credentials are missing or API call fails.
   */
  async getMetrics(
    creds: DecryptedCredential,
    externalCampaignId: string,
    since: Date,
    until: Date,
  ): Promise<AdMetrics> {
    const { developerToken, clientId, clientSecret, refreshToken, customerId } =
      extractGoogleCreds(creds);
    const cleanCustomerId = customerId.replace(/-/g, "");

    logger.info("[google-ads] getMetrics — buscando métricas", {
      customerId: cleanCustomerId,
      externalCampaignId,
      since: since.toISOString(),
      until: until.toISOString(),
    });

    const accessToken = await getAccessToken(clientId, clientSecret, refreshToken);

    // Format dates as YYYY-MM-DD for GAQL
    const sinceStr = since.toISOString().slice(0, 10);
    const untilStr = until.toISOString().slice(0, 10);

    const gaqlQuery =
      `SELECT campaign.id, metrics.impressions, metrics.clicks, ` +
      `metrics.conversions, metrics.cost_micros, metrics.ctr, ` +
      `metrics.average_cpc, metrics.all_conversions_value ` +
      `FROM campaign ` +
      `WHERE campaign.id = '${externalCampaignId}' ` +
      `AND segments.date BETWEEN '${sinceStr}' AND '${untilStr}'`;

    const responseData = await googleAdsPost(
      `/customers/${cleanCustomerId}/googleAds:search`,
      { query: gaqlQuery },
      accessToken,
      developerToken,
    );

    const raw = JSON.stringify(responseData);

    // Parse GAQL response — Google Ads REST returns { results: [...] }
    const results = (responseData as Record<string, unknown>).results;
    if (!Array.isArray(results) || results.length === 0) {
      logger.warn("[google-ads] getMetrics — no results returned", {
        customerId: cleanCustomerId,
        externalCampaignId,
      });
      return {
        impressions: 0,
        clicks: 0,
        conversions: 0,
        spendBrl: 0,
        ctr: 0,
        cpc: 0,
        roas: 0,
        rawJson: raw,
      };
    }

    // Aggregate metrics across all rows (one row per day when using date segment)
    let totalImpressions = 0;
    let totalClicks = 0;
    let totalConversions = 0;
    let totalCostMicros = 0;
    let totalConversionValue = 0;

    for (const row of results as Array<Record<string, unknown>>) {
      const metrics = (row.metrics ?? {}) as Record<string, unknown>;
      totalImpressions += Number(metrics.impressions ?? 0);
      totalClicks += Number(metrics.clicks ?? 0);
      totalConversions += Number(metrics.conversions ?? 0);
      totalCostMicros += Number(metrics.cost_micros ?? 0);
      totalConversionValue += Number(metrics.all_conversions_value ?? 0);
    }

    // Convert micros to BRL (1 BRL = 1,000,000 micros)
    const spendBrl = totalCostMicros / 1_000_000;
    const ctr = totalImpressions > 0 ? totalClicks / totalImpressions : 0;
    const cpc = totalClicks > 0 ? spendBrl / totalClicks : 0;
    const roas = spendBrl > 0 ? totalConversionValue / spendBrl : 0;

    logger.info("[google-ads] getMetrics — métricas coletadas", {
      customerId: cleanCustomerId,
      externalCampaignId,
      impressions: totalImpressions,
      clicks: totalClicks,
      spendBrl,
    });

    return {
      impressions: totalImpressions,
      clicks: totalClicks,
      conversions: totalConversions,
      spendBrl,
      ctr,
      cpc,
      roas,
      rawJson: raw,
    };
  },

  /**
   * Pauses a specific Google Ads ad (AdGroupAd) by setting its status to PAUSED.
   *
   * REST endpoint:
   *   POST /customers/{customerId}/adGroupAds:mutate
   *   body: { operations: [{ update: { resourceName: ads/{customerId}/{adGroupId}~{adId},
   *           status: "PAUSED" }, updateMask: "status" }] }
   *
   * @throws {ExternalServiceError} if credentials are missing or API call fails.
   */
  async pauseAd(creds: DecryptedCredential, externalAdId: string): Promise<void> {
    const { developerToken, clientId, clientSecret, refreshToken, customerId } =
      extractGoogleCreds(creds);
    const cleanCustomerId = customerId.replace(/-/g, "");

    logger.info("[google-ads] pauseAd — pausando anúncio", {
      customerId: cleanCustomerId,
      externalAdId,
    });

    const accessToken = await getAccessToken(clientId, clientSecret, refreshToken);

    await googleAdsPost(
      `/customers/${cleanCustomerId}/adGroupAds:mutate`,
      {
        operations: [
          {
            update: {
              resourceName: externalAdId,
              status: "PAUSED",
            },
            updateMask: "status",
          },
        ],
      },
      accessToken,
      developerToken,
    );

    logger.info("[google-ads] pauseAd — anúncio pausado com sucesso", {
      customerId: cleanCustomerId,
      externalAdId,
    });
  },

  /**
   * Updates the daily budget of a Google Ads campaign.
   *
   * Google Ads uses a shared CampaignBudget resource; this method updates the
   * budget linked to the given campaign resource name.
   *
   * REST endpoint:
   *   POST /customers/{customerId}/campaignBudgets:mutate
   *   body: { operations: [{ update: { resourceName, amountMicros: dailyBudgetMicros },
   *           updateMask: "amount_micros" }] }
   *
   * @param dailyBudgetMicros  New daily budget in micros (1 BRL = 1,000,000 micros).
   * @throws {ExternalServiceError} if credentials are missing or API call fails.
   */
  async updateCampaignBudget(
    creds: DecryptedCredential,
    externalCampaignId: string,
    dailyBudgetMicros: number,
  ): Promise<void> {
    const { developerToken, clientId, clientSecret, refreshToken, customerId } =
      extractGoogleCreds(creds);
    const cleanCustomerId = customerId.replace(/-/g, "");

    logger.info("[google-ads] updateCampaignBudget — atualizando orçamento", {
      customerId: cleanCustomerId,
      externalCampaignId,
      dailyBudgetMicros,
    });

    const accessToken = await getAccessToken(clientId, clientSecret, refreshToken);

    // First, fetch the campaign to get the linked budget resource name
    const campaignData = (await googleAdsGet(
      `/customers/${cleanCustomerId}/${externalCampaignId}`,
      accessToken,
      developerToken,
    )) as Record<string, unknown>;

    const campaignBudgetResourceName = (
      campaignData.campaignBudget as string | undefined
    );

    if (!campaignBudgetResourceName) {
      throw new ExternalServiceError(
        "Google Ads",
        `Não foi possível obter o recurso de orçamento da campanha ${externalCampaignId}.`,
      );
    }

    await googleAdsPost(
      `/customers/${cleanCustomerId}/campaignBudgets:mutate`,
      {
        operations: [
          {
            update: {
              resourceName: campaignBudgetResourceName,
              amountMicros: String(dailyBudgetMicros),
            },
            updateMask: "amount_micros",
          },
        ],
      },
      accessToken,
      developerToken,
    );

    logger.info("[google-ads] updateCampaignBudget — orçamento atualizado com sucesso", {
      customerId: cleanCustomerId,
      externalCampaignId,
      dailyBudgetMicros,
    });
  },
};
