/**
 * ab-test-analysis.service.ts
 * Pure analysis/decision logic for A/B tests.
 */

import type { AbTest } from "@prisma/client";
import type { AbTestVariation, VariationMetrics } from "./ab-test.types";
import {
  MIN_HOURS_FOR_COMPLETION,
  MAX_DAYS_FOR_TIMEOUT,
  MIN_IMPRESSIONS_PER_VARIATION,
  EXTENSION_HOURS,
} from "./ab-test.types";

export function selectWinner(variations: AbTestVariation[]): AbTestVariation {
  if (variations.length === 0) throw new Error("Cannot select a winner from an empty variations array.");
  return variations.reduce((best, current) => (current.ctr > best.ctr ? current : best));
}

export type CheckResult =
  | { action: "too_early" }
  | { action: "extend"; reason: string }
  | { action: "finalize"; reason: "completed" | "timeout" };

export function evaluateTest(
  test: AbTest,
  currentMetrics: VariationMetrics[],
): CheckResult {
  const now = new Date();
  const hoursElapsed = (now.getTime() - test.startedAt.getTime()) / (1000 * 60 * 60);
  const daysElapsed = hoursElapsed / 24;

  // Timeout after MAX_DAYS_FOR_TIMEOUT
  if (daysElapsed >= MAX_DAYS_FOR_TIMEOUT) {
    return { action: "finalize", reason: "timeout" };
  }

  // Too early if less than MIN_HOURS_FOR_COMPLETION
  if (hoursElapsed < MIN_HOURS_FOR_COMPLETION) {
    return { action: "too_early" };
  }

  // Check if all variations have enough impressions
  const allHaveEnoughData = currentMetrics.every(
    (m) => m.impressions >= MIN_IMPRESSIONS_PER_VARIATION,
  );

  if (!allHaveEnoughData) {
    // Extend by EXTENSION_HOURS if we haven't timed out
    return { action: "extend", reason: `Variações sem ${MIN_IMPRESSIONS_PER_VARIATION} impressões mínimas` };
  }

  return { action: "finalize", reason: "completed" };
}
