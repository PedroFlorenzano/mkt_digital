/**
 * variation.service.ts
 *
 * Brand-context-aware image prompt building utilities.
 * Pure functions — no Prisma, no HTTP calls.
 */

/**
 * Brand identity context extracted from the Company model.
 */
export interface BrandContext {
  /** Hex color values, e.g. ["#3B82F6", "#1E40AF", "#FFFFFF"] */
  colors: string[];
  /** Tone of voice, e.g. "professional", "funny" */
  tone: string;
  /** Business sector, e.g. "Tecnologia", "Vendas" */
  sector: string;
  /** Business objective, e.g. "Gerar leads" */
  objective?: string;
}

/**
 * Builds an enriched image prompt that includes the brand's visual identity.
 *
 * Rules:
 * - If `ctx.colors` is non-empty: appends `"Color palette: #HEX1, #HEX2, ..."`
 * - Always appends `"Brand tone: ${ctx.tone}. Industry: ${ctx.sector}."`
 * - If `ctx.objective` is provided and non-empty: appends `"Business objective: ${ctx.objective}."`
 * - Sections are separated by a single space.
 *
 * @param basePrompt - The original image generation prompt.
 * @param ctx - The brand context to inject into the prompt.
 * @returns The enriched prompt string.
 */
export function buildBrandPrompt(basePrompt: string, ctx: BrandContext): string {
  const parts: string[] = [basePrompt];

  if (ctx.colors.length > 0) {
    parts.push(`Color palette: ${ctx.colors.join(", ")}.`);
  }

  parts.push(`Brand tone: ${ctx.tone}. Industry: ${ctx.sector}.`);

  if (ctx.objective && ctx.objective.trim().length > 0) {
    parts.push(`Business objective: ${ctx.objective}.`);
  }

  return parts.join(" ");
}

/**
 * Parses the Company.colors field (stored as a JSON string or comma-separated
 * list of hex values) into an array of hex strings.
 *
 * Handles:
 * - JSON array: `'["#3B82F6","#FFFFFF"]'` → `["#3B82F6", "#FFFFFF"]`
 * - Comma-separated: `"#3B82F6, #FFFFFF"` → `["#3B82F6", "#FFFFFF"]`
 * - Empty, null, or undefined → `[]`
 * - Invalid / non-parseable values → `[]`
 *
 * @param colorsField - The raw value from Company.colors (may be null/undefined).
 * @returns An array of hex color strings, or `[]` if the field is absent or invalid.
 */
export function parseColors(colorsField: string | null | undefined): string[] {
  if (!colorsField || colorsField.trim() === "") {
    return [];
  }

  const trimmed = colorsField.trim();

  // Attempt JSON array parse first
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        const colors = parsed
          .filter((item): item is string => typeof item === "string")
          .map((c) => c.trim())
          .filter((c) => c.length > 0);
        return colors;
      }
    } catch {
      // Fall through to comma-separated parsing
    }
  }

  // Fall back to comma-separated parsing
  const colors = trimmed
    .split(",")
    .map((c) => c.trim())
    .filter((c) => c.length > 0);

  return colors;
}
