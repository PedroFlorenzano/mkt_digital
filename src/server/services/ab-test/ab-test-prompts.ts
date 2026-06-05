/**
 * ab-test-prompts.ts
 * Prompt builders and parser for AI-generated creative variations.
 */

import type { AdCreative, RawCreativeVariation } from "./ab-test.types";

export function buildCreativeVariationSystemPrompt(): string {
  return `Você é um especialista em copywriting e criativos para anúncios pagos.
Gere exatamente 3 variações de criativos para teste A/B.

Responda APENAS com este JSON (sem markdown):
[
  {"headline": "string", "description": "string", "callToAction": "string"},
  {"headline": "string", "description": "string", "callToAction": "string"},
  {"headline": "string", "description": "string", "callToAction": "string"}
]

REGRAS:
1. Cada variação deve ter abordagem diferente (emocional, racional, urgência).
2. headline: máx 40 chars.
3. description: máx 125 chars.
4. callToAction: um dos valores: "SHOP_NOW", "LEARN_MORE", "SIGN_UP", "GET_OFFER", "CONTACT_US".
5. Responda SOMENTE com o JSON array.`;
}

export function buildCreativeVariationUserMessage(original: AdCreative): string {
  return `Criativo original para referência:
- Headline: ${original.headline}
- Description: ${original.description}
- Call to Action: ${original.callToAction}

Gere 3 variações distintas mantendo a essência da mensagem mas com abordagens diferentes.`;
}

export function parseCreativeVariations(rawText: string): RawCreativeVariation[] {
  let jsonStr = rawText.replace(/```json\s*/gi, "").replace(/```\s*/g, "");
  const jsonMatch = jsonStr.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error("Sem JSON array na resposta");
  jsonStr = jsonMatch[0];

  let parsed: unknown[];
  try {
    parsed = JSON.parse(jsonStr) as unknown[];
  } catch {
    parsed = JSON.parse(jsonStr.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")) as unknown[];
  }

  if (!Array.isArray(parsed) || parsed.length < 3) {
    throw new Error("Resposta deve conter ao menos 3 variações");
  }

  return parsed.slice(0, 3).map((item) => {
    const v = item as Record<string, unknown>;
    return {
      headline: typeof v.headline === "string" ? v.headline : "Variação",
      description: typeof v.description === "string" ? v.description : "",
      callToAction: typeof v.callToAction === "string" ? v.callToAction : "LEARN_MORE",
    };
  });
}

export function buildResultSummary(
  winner: { creative: AdCreative; ctr: number },
  allVariations: { ctr: number; variationIndex: number }[],
  reason: "completed" | "timeout",
): string {
  const reasonLabel = reason === "completed" ? "por dados suficientes" : "por timeout (7 dias)";
  const ctrList = allVariations
    .map((v) => `  Variação ${v.variationIndex}: CTR ${(v.ctr * 100).toFixed(2)}%`)
    .join("\n");
  return `Teste A/B finalizado ${reasonLabel}.\nVencedor: "${winner.creative.headline}" (CTR ${(winner.ctr * 100).toFixed(2)}%)\n\nResultados:\n${ctrList}`;
}
