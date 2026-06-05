/**
 * campaign/index.ts
 * Barrel — re-exports the campaignService facade with the same API shape.
 */

export type { CampaignDraft, AudienceSegmentation, AdCopy, Keyword, AdCampaignWithLatestMetrics, PerformanceReport } from "./campaign.types";
export type { AdPlatform } from "@server/services/credential.service";

import { generateCampaignDraft } from "./campaign-generation.service";
import { launchCampaign } from "./campaign-launch.service";
import { getPerformanceReport } from "./campaign-reporting.service";
import { listByCompany } from "./campaign-query.service";

export const campaignService = {
  generate: generateCampaignDraft,
  launch: launchCampaign,
  getPerformanceReport,
  listByCompany,
};
