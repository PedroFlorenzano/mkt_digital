/**
 * campaign.service.ts
 * Facade — delegates to decomposed sub-modules in ./campaign/
 */

export { campaignService } from "./campaign/index";
export type {
  CampaignDraft,
  AudienceSegmentation,
  AdCopy,
  Keyword,
  AdCampaignWithLatestMetrics,
  PerformanceReport,
} from "./campaign/campaign.types";
export type { AdPlatform } from "@server/services/credential.service";
