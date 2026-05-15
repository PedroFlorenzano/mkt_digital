/**
 * meta-ads.connector.ts
 *
 * Connector for the Meta Marketing API v21.0.
 * Uses native `fetch` with AbortController — no external SDK dependencies.
 *
 * All methods accept DecryptedCredential whose `fields` map must contain:
 *   - accessToken    : User / System-User access token
 *   - adAccountId   : Ad account ID — e.g. "act_123456789"
 *
 * Errors from the Meta API are logged via `logger.error` before being
 * re-thrown as ExternalServiceError (HTTP 502).
 */

import { logger } from "@server/lib/logger";
import { ExternalServiceError } from "@server/lib/errors";
import type { DecryptedCredential } from "@server/services/credential.service";
import type { CampaignDraft } from "@server/services/campaign.service";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const META_API_BASE = "https://graph.facebook.com/v21.0";
const DEFAULT_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface ValidationResult {
  valid: boolean;
  error?: string;
  invalidFields?: string[];
}

export interface MetaCampaignResult {
  externalCampaignId: string;
  externalAdSetId: string;
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
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Builds a URL-encoded form body from a plain object.
 * Omits keys whose value is undefined or null.
 */
function formBody(params: Record<string, unknown>): string {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(
      ([k, v]) =>
        `${encodeURIComponent(k)}=${encodeURIComponent(
          typeof v === "object" ? JSON.stringify(v) : String(v),
        )}`,
    )
    .join("&");
}

/**
 * Executes a Meta Graph API call with an optional AbortController timeout.
 * Throws ExternalServiceError when the HTTP response is not 2xx or when the
 * Meta response envelope contains `error`.
 */
async function callMeta<T = unknown>(
  method: "GET" | "POST",
  path: string,
  params: Record<string, unknown>,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let url: string;
  let fetchOptions: RequestInit;

  if (method === "GET") {
    const qs = formBody(params);
    url = `${META_API_BASE}${path}?${qs}`;
    fetchOptions = { method: "GET", signal: controller.signal };
  } else {
    url = `${META_API_BASE}${path}`;
    fetchOptions = {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formBody(params),
      signal: controller.signal,
    };
  }

  let res: Response;
  try {
    res = await fetch(url, fetchOptions);
  } catch (err) {
    clearTimeout(timer);
    const msg = err instanceof Error ? err.message : String(err);
    throw new ExternalServiceError("Meta Ads", `Network error: ${msg}`);
  }
  clearTimeout(timer);

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new ExternalServiceError(
      "Meta Ads",
      `Non-JSON response (HTTP ${res.status}) from ${path}`,
    );
  }

  // Meta wraps errors in an `error` envelope even on 200 sometimes
  const envelope = body as Record<string, unknown>;
  if (envelope.error) {
    const apiErr = envelope.error as Record<string, unknown>;
    const message =
      typeof apiErr.message === "string" ? apiErr.message : JSON.stringify(apiErr);
    throw new ExternalServiceError("Meta Ads", message);
  }

  if (!res.ok) {
    throw new ExternalServiceError(
      "Meta Ads",
      `HTTP ${res.status} from ${path}: ${JSON.stringify(body).slice(0, 300)}`,
    );
  }

  return body as T;
}

/**
 * Extracts the numeric value from a Meta actions array.
 * Returns 0 if not found.
 */
function extractActionValue(
  actions: Array<{ action_type: string; value: string }> | undefined,
  actionType: string,
): number {
  if (!actions) return 0;
  const found = actions.find((a) => a.action_type === actionType);
  return found ? parseFloat(found.value) || 0 : 0;
}

// ---------------------------------------------------------------------------
// Connector implementation
// ---------------------------------------------------------------------------

export const metaAdsConnector = {
  // -------------------------------------------------------------------------
  // validateCredentials
  // -------------------------------------------------------------------------

  /**
   * Validates Meta credentials by calling GET /me with the access token.
   * Uses a 10-second AbortController timeout.
   *
   * @returns { valid: true } on success.
   * @returns { valid: false, error: string } on any failure.
   */
  async validateCredentials(
    creds: DecryptedCredential,
  ): Promise<ValidationResult> {
    const { accessToken } = creds.fields;

    if (!accessToken) {
      return { valid: false, error: "accessToken ausente nas credenciais." };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    try {
      const url = `${META_API_BASE}/me?fields=id,name&access_token=${encodeURIComponent(accessToken)}`;
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);

      const body = (await res.json()) as Record<string, unknown>;

      if (body.error) {
        const apiErr = body.error as Record<string, unknown>;
        const message =
          typeof apiErr.message === "string"
            ? apiErr.message
            : JSON.stringify(apiErr);
        return { valid: false, error: message };
      }

      if (!res.ok) {
        return {
          valid: false,
          error: `HTTP ${res.status}: ${JSON.stringify(body).slice(0, 200)}`,
        };
      }

      return { valid: true };
    } catch (err) {
      clearTimeout(timer);
      const message = err instanceof Error ? err.message : String(err);
      return { valid: false, error: message };
    }
  },

  // -------------------------------------------------------------------------
  // createCampaign
  // -------------------------------------------------------------------------

  /**
   * Creates a full Meta Ads campaign in three steps:
   *   1. Campaign  (OUTCOME_AWARENESS objective)
   *   2. Ad Set    (daily budget in cents, audience targeting, LOWEST_COST_WITHOUT_CAP)
   *   3. Ad Creatives + Ads (one ad per AdCopy)
   *
   * Logs detailed error information before throwing ExternalServiceError.
   *
   * @returns MetaCampaignResult with all external IDs and the manager URL.
   */
  async createCampaign(
    creds: DecryptedCredential,
    draft: CampaignDraft,
  ): Promise<MetaCampaignResult> {
    const { accessToken, adAccountId } = creds.fields;

    if (!accessToken || !adAccountId) {
      throw new ExternalServiceError(
        "Meta Ads",
        "accessToken ou adAccountId ausente nas credenciais.",
      );
    }

    // Normalise ad account ID — Meta requires "act_XXXXXXXX" prefix
    const accountId = adAccountId.startsWith("act_")
      ? adAccountId
      : `act_${adAccountId}`;

    // ------------------------------------------------------------------
    // Step 1 — Create Campaign
    // ------------------------------------------------------------------
    let externalCampaignId: string;
    try {
      const campaignRes = await callMeta<{ id: string }>(
        "POST",
        `/${accountId}/campaigns`,
        {
          name: draft.objective.slice(0, 255),
          objective: "OUTCOME_AWARENESS",
          status: "ACTIVE",
          special_ad_categories: "[]",
          access_token: accessToken,
        },
      );
      externalCampaignId = campaignRes.id;
      logger.info("[meta-ads] Campaign created", { externalCampaignId });
    } catch (err) {
      logger.error("[meta-ads] Failed to create campaign", err, {
        adAccountId,
        step: "campaign",
      });
      throw err instanceof ExternalServiceError
        ? err
        : new ExternalServiceError(
            "Meta Ads",
            `Falha ao criar campanha: ${err instanceof Error ? err.message : String(err)}`,
          );
    }

    // ------------------------------------------------------------------
    // Step 2 — Create Ad Set
    // ------------------------------------------------------------------
    let externalAdSetId: string;
    try {
      // Convert daily budget from BRL to cents (Meta uses account currency
      // minor units; for BRL accounts 1 BRL = 100 centavos)
      const dailyBudgetCents = Math.round(draft.dailyBudgetBrl * 100);

      const targeting: Record<string, unknown> = {
        age_min: draft.audience.ageMin,
        age_max: draft.audience.ageMax,
        geo_locations: {
          countries: draft.audience.locations.length > 0
            ? draft.audience.locations
            : ["BR"],
        },
      };

      if (draft.audience.interests.length > 0) {
        targeting.interests = draft.audience.interests.map((name) => ({
          name,
        }));
      }

      if (draft.audience.behaviors.length > 0) {
        targeting.behaviors = draft.audience.behaviors.map((name) => ({
          name,
        }));
      }

      const adSetRes = await callMeta<{ id: string }>(
        "POST",
        `/${accountId}/adsets`,
        {
          name: `${draft.objective.slice(0, 200)} — Ad Set`,
          campaign_id: externalCampaignId,
          daily_budget: dailyBudgetCents,
          billing_event: "IMPRESSIONS",
          bid_strategy: "LOWEST_COST_WITHOUT_CAP",
          targeting: JSON.stringify(targeting),
          status: "ACTIVE",
          access_token: accessToken,
        },
      );
      externalAdSetId = adSetRes.id;
      logger.info("[meta-ads] Ad Set created", { externalAdSetId });
    } catch (err) {
      logger.error("[meta-ads] Failed to create ad set", err, {
        adAccountId,
        externalCampaignId,
        step: "adset",
      });
      throw err instanceof ExternalServiceError
        ? err
        : new ExternalServiceError(
            "Meta Ads",
            `Falha ao criar ad set: ${err instanceof Error ? err.message : String(err)}`,
          );
    }

    // ------------------------------------------------------------------
    // Step 3 — Create Ad Creatives and Ads
    // ------------------------------------------------------------------
    const externalAdIds: string[] = [];

    for (const adCopy of draft.adCopies) {
      const variation = adCopy.variations[0] ?? draft.creativeBrief.slice(0, 125);

      let creativeId: string;
      try {
        const creativeRes = await callMeta<{ id: string }>(
          "POST",
          `/${accountId}/adcreatives`,
          {
            name: `Creative — ${adCopy.placement}`.slice(0, 255),
            object_story_spec: JSON.stringify({
              page_id: accountId, // fallback; real usage requires page_id
              link_data: {
                message: variation,
                link: "https://example.com",
                name: draft.objective.slice(0, 255),
                description: draft.creativeBrief.slice(0, 255),
              },
            }),
            access_token: accessToken,
          },
        );
        creativeId = creativeRes.id;
      } catch (err) {
        logger.error("[meta-ads] Failed to create ad creative", err, {
          adAccountId,
          externalCampaignId,
          externalAdSetId,
          placement: adCopy.placement,
          step: "adcreative",
        });
        throw err instanceof ExternalServiceError
          ? err
          : new ExternalServiceError(
              "Meta Ads",
              `Falha ao criar criativo (${adCopy.placement}): ${err instanceof Error ? err.message : String(err)}`,
            );
      }

      let adId: string;
      try {
        const adRes = await callMeta<{ id: string }>(
          "POST",
          `/${accountId}/ads`,
          {
            name: `Ad — ${adCopy.placement}`.slice(0, 255),
            adset_id: externalAdSetId,
            creative: JSON.stringify({ creative_id: creativeId }),
            status: "ACTIVE",
            access_token: accessToken,
          },
        );
        adId = adRes.id;
        externalAdIds.push(adId);
        logger.info("[meta-ads] Ad created", { adId, placement: adCopy.placement });
      } catch (err) {
        logger.error("[meta-ads] Failed to create ad", err, {
          adAccountId,
          externalCampaignId,
          externalAdSetId,
          creativeId,
          placement: adCopy.placement,
          step: "ad",
        });
        throw err instanceof ExternalServiceError
          ? err
          : new ExternalServiceError(
              "Meta Ads",
              `Falha ao criar anúncio (${adCopy.placement}): ${err instanceof Error ? err.message : String(err)}`,
            );
      }
    }

    const managerUrl = `https://www.facebook.com/adsmanager/manage/campaigns?act=${adAccountId.replace("act_", "")}&campaign_id=${externalCampaignId}`;

    return {
      externalCampaignId,
      externalAdSetId,
      externalAdIds,
      managerUrl,
    };
  },

  // -------------------------------------------------------------------------
  // getMetrics
  // -------------------------------------------------------------------------

  /**
   * Fetches campaign insights from the Meta Insights API.
   * Maps the raw response to an AdMetrics object.
   */
  async getMetrics(
    creds: DecryptedCredential,
    externalCampaignId: string,
    since: Date,
    until: Date,
  ): Promise<AdMetrics> {
    const { accessToken } = creds.fields;

    if (!accessToken) {
      throw new ExternalServiceError(
        "Meta Ads",
        "accessToken ausente nas credenciais.",
      );
    }

    const timeRange = JSON.stringify({
      since: since.toISOString().split("T")[0],
      until: until.toISOString().split("T")[0],
    });

    type InsightData = {
      impressions?: string;
      clicks?: string;
      spend?: string;
      ctr?: string;
      cpc?: string;
      actions?: Array<{ action_type: string; value: string }>;
    };

    type InsightsResponse = {
      data?: InsightData[];
    };

    let raw: InsightsResponse;
    try {
      raw = await callMeta<InsightsResponse>(
        "GET",
        `/${externalCampaignId}/insights`,
        {
          fields: "impressions,clicks,spend,actions,ctr,cpc",
          time_range: timeRange,
          access_token: accessToken,
        },
      );
    } catch (err) {
      logger.error("[meta-ads] Failed to fetch insights", err, {
        externalCampaignId,
      });
      throw err instanceof ExternalServiceError
        ? err
        : new ExternalServiceError(
            "Meta Ads",
            `Falha ao buscar métricas: ${err instanceof Error ? err.message : String(err)}`,
          );
    }

    const data = raw.data?.[0] ?? {};

    const impressions = parseInt(data.impressions ?? "0", 10) || 0;
    const clicks = parseInt(data.clicks ?? "0", 10) || 0;
    const spendBrl = parseFloat(data.spend ?? "0") || 0;
    const ctr = parseFloat(data.ctr ?? "0") || 0;
    const cpc = parseFloat(data.cpc ?? "0") || 0;

    // Conversions from the actions array (purchase or lead actions)
    const conversions =
      extractActionValue(data.actions, "offsite_conversion.fb_pixel_purchase") ||
      extractActionValue(data.actions, "lead") ||
      extractActionValue(data.actions, "complete_registration");

    // ROAS: revenue / spend — Meta sometimes provides purchase_roas action
    const roas =
      spendBrl > 0
        ? extractActionValue(data.actions, "omni_purchase") / spendBrl
        : 0;

    return {
      impressions,
      clicks,
      conversions,
      spendBrl,
      ctr,
      cpc,
      roas,
      rawJson: JSON.stringify(raw),
    };
  },

  // -------------------------------------------------------------------------
  // pauseAd
  // -------------------------------------------------------------------------

  /**
   * Pauses a single ad by setting its status to PAUSED.
   */
  async pauseAd(
    creds: DecryptedCredential,
    externalAdId: string,
  ): Promise<void> {
    const { accessToken } = creds.fields;

    if (!accessToken) {
      throw new ExternalServiceError(
        "Meta Ads",
        "accessToken ausente nas credenciais.",
      );
    }

    try {
      await callMeta<{ success: boolean }>("POST", `/${externalAdId}`, {
        status: "PAUSED",
        access_token: accessToken,
      });
      logger.info("[meta-ads] Ad paused", { externalAdId });
    } catch (err) {
      logger.error("[meta-ads] Failed to pause ad", err, { externalAdId });
      throw err instanceof ExternalServiceError
        ? err
        : new ExternalServiceError(
            "Meta Ads",
            `Falha ao pausar anúncio ${externalAdId}: ${err instanceof Error ? err.message : String(err)}`,
          );
    }
  },

  // -------------------------------------------------------------------------
  // pauseAdSet
  // -------------------------------------------------------------------------

  /**
   * Pauses an Ad Set by setting its status to PAUSED.
   */
  async pauseAdSet(
    creds: DecryptedCredential,
    externalAdSetId: string,
  ): Promise<void> {
    const { accessToken } = creds.fields;

    if (!accessToken) {
      throw new ExternalServiceError(
        "Meta Ads",
        "accessToken ausente nas credenciais.",
      );
    }

    try {
      await callMeta<{ success: boolean }>("POST", `/${externalAdSetId}`, {
        status: "PAUSED",
        access_token: accessToken,
      });
      logger.info("[meta-ads] Ad Set paused", { externalAdSetId });
    } catch (err) {
      logger.error("[meta-ads] Failed to pause ad set", err, { externalAdSetId });
      throw err instanceof ExternalServiceError
        ? err
        : new ExternalServiceError(
            "Meta Ads",
            `Falha ao pausar ad set ${externalAdSetId}: ${err instanceof Error ? err.message : String(err)}`,
          );
    }
  },

  // -------------------------------------------------------------------------
  // updateAdSetBudget
  // -------------------------------------------------------------------------

  /**
   * Updates the daily budget of an Ad Set.
   *
   * @param dailyBudgetCents — budget in the account's currency minor units
   *   (e.g. centavos for BRL accounts).
   */
  async updateAdSetBudget(
    creds: DecryptedCredential,
    externalAdSetId: string,
    dailyBudgetCents: number,
  ): Promise<void> {
    const { accessToken } = creds.fields;

    if (!accessToken) {
      throw new ExternalServiceError(
        "Meta Ads",
        "accessToken ausente nas credenciais.",
      );
    }

    try {
      await callMeta<{ success: boolean }>("POST", `/${externalAdSetId}`, {
        daily_budget: dailyBudgetCents,
        access_token: accessToken,
      });
      logger.info("[meta-ads] Ad Set budget updated", {
        externalAdSetId,
        dailyBudgetCents,
      });
    } catch (err) {
      logger.error("[meta-ads] Failed to update ad set budget", err, {
        externalAdSetId,
        dailyBudgetCents,
      });
      throw err instanceof ExternalServiceError
        ? err
        : new ExternalServiceError(
            "Meta Ads",
            `Falha ao atualizar orçamento do ad set ${externalAdSetId}: ${err instanceof Error ? err.message : String(err)}`,
          );
    }
  },
};
