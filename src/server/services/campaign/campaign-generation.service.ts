/**
 * campaign-generation.service.ts
 * AI draft generation via AWS Bedrock (Claude).
 */

import { prisma } from "@server/lib/prisma";
import { generateTextWithBedrock } from "@server/lib/bedrock";
import { ExternalServiceError, NotFoundError } from "@server/lib/errors";
import { logger } from "@server/lib/logger";
import type { CampaignDraft } from "./campaign.types";

function buildSystemPrompt(company: {
  name: string;
  description?: string | null;
  sector?: string | null;
  objective?: string | null;
  tone: string;
}): string {
  const safe = (value: string | null | undefined): string =>
    value?.trim() || "Não informado";

  return `Você é um especialista em tráfego pago e marketing digital.
Gere um rascunho de campanha de anúncios pagos em formato JSON compacto.

PERFIL DA MARCA:
- Nome: ${safe(company.name)}
- Setor: ${safe(company.sector)}
- Objetivo: ${safe(company.objective)}
- Tom de voz: ${safe(company.tone)}
- Descrição: ${safe(company.description)}

RESPONDA APENAS com este JSON (sem markdown, sem texto extra, sem comentários):
{
  "objective": "objetivo da campanha em uma frase",
  "audience": {
    "ageMin": 25, "ageMax": 45,
    "locations": ["São Paulo", "Brasil"],
    "interests": ["interesse1", "interesse2"],
    "behaviors": ["comportamento1"]
  },
  "dailyBudgetBrl": 100,
  "adCopies": [
    { "placement": "feed_instagram", "variations": ["copy 1", "copy 2", "copy 3"] },
    { "placement": "stories", "variations": ["copy 1", "copy 2", "copy 3"] }
  ],
  "creativeBrief": "instruções visuais para os criativos"
}

REGRAS:
1. Exatamente 2 posicionamentos em adCopies, cada um com exatamente 3 variações curtas (máx 100 chars cada).
2. Não inclua o campo "keywords".
3. dailyBudgetBrl deve ser número realista para o setor.
4. Todas as strings devem usar apenas aspas duplas.
5. Responda SOMENTE com o JSON.`;
}

function validateDraft(draft: unknown): CampaignDraft {
  if (!draft || typeof draft !== "object") throw new Error("Resposta da IA não é um objeto JSON válido.");
  const d = draft as Record<string, unknown>;
  if (typeof d.objective !== "string" || !d.objective.trim()) throw new Error("Campo obrigatório ausente: objective");
  const audience = d.audience as Record<string, unknown> | undefined;
  if (!audience || typeof audience !== "object") throw new Error("Campo obrigatório ausente: audience");
  if (typeof audience.ageMin !== "number") throw new Error("Campo inválido: audience.ageMin");
  if (typeof audience.ageMax !== "number") throw new Error("Campo inválido: audience.ageMax");
  if (!Array.isArray(audience.locations)) throw new Error("Campo ausente: audience.locations");
  if (!Array.isArray(audience.interests)) throw new Error("Campo ausente: audience.interests");
  if (!Array.isArray(audience.behaviors)) throw new Error("Campo ausente: audience.behaviors");
  if (typeof d.dailyBudgetBrl !== "number" || d.dailyBudgetBrl <= 0) throw new Error("Campo inválido: dailyBudgetBrl");
  if (!Array.isArray(d.adCopies) || d.adCopies.length === 0) throw new Error("Campo ausente: adCopies");
  for (const copy of d.adCopies as unknown[]) {
    const c = copy as Record<string, unknown>;
    if (typeof c.placement !== "string") throw new Error("adCopies: cada item deve ter 'placement'");
    if (!Array.isArray(c.variations) || (c.variations as string[]).length < 3) throw new Error(`adCopies[${c.placement}]: 'variations' deve ter no mínimo 3`);
  }
  if (typeof d.creativeBrief !== "string" || !d.creativeBrief.trim()) throw new Error("Campo ausente: creativeBrief");
  if (d.keywords !== undefined && !Array.isArray(d.keywords)) d.keywords = undefined;
  return d as unknown as CampaignDraft;
}

export async function generateCampaignDraft(companyId: string, description: string): Promise<CampaignDraft> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true, description: true, sector: true, objective: true, tone: true, colors: true },
  });
  if (!company) throw new NotFoundError(`Empresa com id '${companyId}'`);

  const systemPrompt = buildSystemPrompt(company);
  const userMessage = `Crie uma campanha de tráfego pago para a seguinte descrição de objetivo:\n\n${description}`;

  let rawText: string;
  try {
    const result = await generateTextWithBedrock(companyId, systemPrompt, userMessage);
    rawText = result.options?.[0]?.content ?? "";
    logger.info("[campaign] Bedrock response received", { model: result.usage.model, costUsd: result.usage.costUsd });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new ExternalServiceError("AWS Bedrock", message);
  }

  let parsedDraft: unknown;
  try {
    let jsonStr = rawText.replace(/```json\s*/gi, "").replace(/```\s*/g, "");
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Sem JSON na resposta");
    jsonStr = jsonMatch[0];
    try { parsedDraft = JSON.parse(jsonStr); } catch { parsedDraft = JSON.parse(jsonStr.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")); }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Falha ao parsear resposta JSON da IA: ${message}`);
  }

  return validateDraft(parsedDraft);
}
