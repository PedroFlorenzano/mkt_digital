/**
 * campaign.types.ts
 * Shared types for the campaign service module.
 */

import type { AdCampaign, AdMetricSnapshot } from "@prisma/client";

export interface AudienceSegmentation {
  ageMin: number;
  ageMax: number;
  locations: string[];
  interests: string[];
  behaviors: string[];
}

export interface AdCopy {
  placement: string;
  variations: string[];
  headlines?: string[];
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
  keywords?: Keyword[];
}

export interface AdCampaignWithLatestMetrics extends AdCampaign {
  latestMetrics?: AdMetricSnapshot | null;
}

export interface PerformanceReport {
  campaign: AdCampaign;
  snapshots: AdMetricSnapshot[];
  aiSummary: string;
  recommendations: string[];
}
