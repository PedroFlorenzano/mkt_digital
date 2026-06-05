/**
 * ab-test/ab-test.types.ts
 * Shared types and constants for the A/B test module.
 */

export interface AdCreative {
  imageUrl?: string;
  headline: string;
  description: string;
  callToAction: string;
}

export interface AbTestVariation {
  externalAdId: string;
  variationIndex: number;
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

export interface VariationMetrics {
  externalAdId: string;
  impressions: number;
  clicks: number;
  ctr: number;
}

export interface RawCreativeVariation {
  headline: string;
  description: string;
  callToAction: string;
}

export const MIN_HOURS_FOR_COMPLETION = 48;
export const MAX_DAYS_FOR_TIMEOUT = 7;
export const MIN_IMPRESSIONS_PER_VARIATION = 100;
export const EXTENSION_HOURS = 24;
