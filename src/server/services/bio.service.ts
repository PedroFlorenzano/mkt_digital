import { prisma } from "@server/lib/prisma";
import { generateTextWithBedrock } from "@server/lib/bedrock";
import { NotFoundError, ValidationError } from "@server/lib/errors";
import { logger } from "@server/lib/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BioSuggestion {
  /** Instagram bio text — max 150 characters including emojis. */
  text: string;
  /** Character count of the trimmed text. */
  charCount: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_BIO_LENGTH = 150;
const SUGGESTIONS_COUNT = 3;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generates exactly 3 Instagram bio suggestions for the given company using
 * Claude via AWS Bedrock.
 *
 * Preconditions:
 * - `name`, `sector`, and `objective` must all be non-empty; otherwise a
 *   `ValidationError` is thrown.
 * - The company identified by `companyId` must exist; otherwise a
 *   `NotFoundError` is thrown.
 *
 * Each returned suggestion is:
 * - Trimmed of leading/trailing whitespace.
 * - Truncated to 150 characters if necessary (safety net).
 * - Annotated with a `charCount` reflecting the final length.
 *
 * Bedrock/network errors are rethrown as-is for the API layer to handle.
 *
 * @param companyId - The cuid of the company.
 * @returns An array of exactly 3 `BioSuggestion` objects.
 * @throws {NotFoundError} if the company does not exist.
 * @throws {ValidationError} if name, sector, or objective are missing.
 */
export async function generateBioSuggestions(
  companyId: string,
): Promise<BioSuggestion[]> {
  // ── 1. Load company ──────────────────────────────────────────────────────
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { name: true, sector: true, objective: true, tone: true },
  });

  if (!company) {
    throw new NotFoundError("Company");
  }

  // ── 2. Validate required fields ──────────────────────────────────────────
  if (
    !company.name?.trim() ||
    !company.sector?.trim() ||
    !company.objective?.trim()
  ) {
    throw new ValidationError(
      "Preencha nome, setor e objetivo da empresa antes de gerar sugestões de bio",
    );
  }

  const { name, sector, objective, tone } = company;

  logger.info("[bio] Generating bio suggestions", { companyId, sector, tone });

  // ── 3. Build prompts ─────────────────────────────────────────────────────
  const systemPrompt = `You are a professional Instagram bio copywriter.
Your task is to generate exactly ${SUGGESTIONS_COUNT} Instagram bio suggestions for a business.

RULES:
- Each bio MUST be at most ${MAX_BIO_LENGTH} characters (including emojis and spaces).
- Each bio MUST contain at least 1 emoji.
- Each bio MUST include a clear call to action (CTA) aligned to the company's objective and tone.
- Respond with ONLY a valid JSON array in this exact format — no explanation, no markdown, no extra text:
[
  { "text": "..." },
  { "text": "..." },
  { "text": "..." }
]`;

  const userMessage = `Generate ${SUGGESTIONS_COUNT} Instagram bio suggestions for this business:

Company name: ${name}
Sector: ${sector}
Objective: ${objective}
Tone: ${tone}

Remember: respond ONLY with the JSON array described in the system prompt.`;

  // ── 4. Call Bedrock ──────────────────────────────────────────────────────
  // generateTextWithBedrock's internal parser targets { ... } JSON objects.
  // When Claude returns a [ ... ] array, it falls back and returns the raw
  // text in options[0]?.content — we parse that as the JSON array ourselves.
  const bedrockResult = await generateTextWithBedrock(
    companyId,
    systemPrompt,
    userMessage,
  );

  // ── 5. Parse JSON array ───────────────────────────────────────────────────
  const rawText = bedrockResult.options[0]?.content ?? "";

  let parsed: Array<{ text: string }>;
  try {
    // Extract the JSON array from the raw text, handling any surrounding
    // whitespace or spurious content Claude may have added.
    const arrayMatch = rawText.match(/\[[\s\S]*\]/);
    const jsonStr = arrayMatch ? arrayMatch[0] : rawText;
    parsed = JSON.parse(jsonStr) as Array<{ text: string }>;
    if (!Array.isArray(parsed)) {
      throw new Error("Response is not an array");
    }
  } catch (err) {
    logger.error("[bio] Failed to parse Bedrock response as JSON array", err, {
      companyId,
      rawText,
    });
    throw new Error("Bedrock returned an unexpected response format for bio suggestions");
  }

  // ── 6. Post-process suggestions ───────────────────────────────────────────
  const suggestions: BioSuggestion[] = parsed
    .slice(0, SUGGESTIONS_COUNT)
    .map((item) => {
      let text = (item.text ?? "").trim();
      // Safety net: truncate to MAX_BIO_LENGTH characters if needed.
      if (text.length > MAX_BIO_LENGTH) {
        text = text.slice(0, MAX_BIO_LENGTH);
      }
      return { text, charCount: text.length };
    });

  logger.info("[bio] Bio suggestions generated", {
    companyId,
    count: suggestions.length,
  });

  return suggestions;
}
