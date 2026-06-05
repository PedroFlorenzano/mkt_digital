/**
 * ab-test/index.ts
 * Barrel — re-exports the abTestService facade.
 */

export type { AdCreative, AbTestVariation, AbTestResult, VariationMetrics } from "./ab-test.types";

import { selectWinner } from "./ab-test-analysis.service";
import { createVariations, checkAndFinalize } from "./ab-test-crud.service";

export const abTestService = {
  selectWinner,
  createVariations,
  checkAndFinalize,
};
