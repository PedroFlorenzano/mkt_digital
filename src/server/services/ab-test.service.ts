/**
 * ab-test.service.ts
 * Facade — delegates to decomposed sub-modules in ./ab-test/
 */

export { abTestService } from "./ab-test/index";
export type { AdCreative, AbTestVariation, AbTestResult, VariationMetrics } from "./ab-test/ab-test.types";
