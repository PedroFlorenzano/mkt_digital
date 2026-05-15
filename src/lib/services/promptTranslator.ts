import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { fromIni } from "@aws-sdk/credential-providers";
import { join } from "path";
import { homedir } from "os";

const BEDROCK_PROFILE = "mktai";
const TEXT_REGION = process.env.AWS_BEDROCK_TEXT_REGION || "us-east-1";
const TEXT_MODEL = "us.anthropic.claude-haiku-4-5-20251001-v1:0"; // rápido e barato para tradução

interface CompanyContext {
  name: string;
  sector?: string | null;
  description?: string | null;
  objective?: string | null;
  tone?: string;
  colors?: string[];
}

/**
 * Usa Claude para traduzir a ideia do usuário (em qualquer idioma)
 * em um prompt técnico em inglês otimizado para Stable Diffusion Ultra.
 *
 * Retorna o prompt traduzido ou null se falhar (o chamador deve usar fallback).
 */
export async function translateToImagePrompt(
  userIdea: string,
  company: CompanyContext,
): Promise<string | null> {
  try {
    const client = new BedrockRuntimeClient({
      region: TEXT_REGION,
      credentials: fromIni({
        profile: BEDROCK_PROFILE,
        filepath: join(homedir(), ".aws", "credentials"),
        configFilepath: join(homedir(), ".aws", "config"),
        ignoreCache: true,
      }),
    });

    const systemPrompt = `You are an expert at writing Stable Diffusion image generation prompts for professional marketing posts.

Your task: Convert the user's marketing idea into a precise, detailed English prompt for Stable Diffusion Ultra.

Rules:
1. The prompt MUST describe a photorealistic scene directly related to the user's idea
2. Include specific visual details: subjects, actions, environment, lighting, camera angle
3. Incorporate the company's sector and brand identity naturally
4. End with quality modifiers: "professional photography, sharp focus, 4K, commercial quality"
5. End with: "NO text, NO words, NO letters, NO watermarks, NO logos in the image"
6. Maximum 600 characters total
7. Return ONLY the prompt, no explanation, no quotes

Company context:
- Name: ${company.name}
- Sector: ${company.sector || "business"}
- Description: ${company.description || ""}
- Objective: ${company.objective || ""}`;

    const userMessage = `User's marketing idea: "${userIdea}"

Generate the Stable Diffusion prompt now:`;

    const body = JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 300,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    const command = new InvokeModelCommand({
      modelId: TEXT_MODEL,
      contentType: "application/json",
      accept: "application/json",
      body: Buffer.from(body),
    });

    const response = await client.send(command);
    const result = JSON.parse(new TextDecoder().decode(response.body));
    const translated = result.content?.[0]?.text?.trim() ?? "";

    if (translated.length < 20) return null;

    // Garante que o prompt não ultrapassa 800 chars
    return translated.slice(0, 800);
  } catch (err) {
    console.error("[promptTranslator] Failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Fallback determinístico quando a tradução falha.
 * Constrói um prompt em inglês a partir dos campos da empresa.
 */
export function buildFallbackPrompt(
  userIdea: string,
  company: CompanyContext,
): string {
  const parts = [
    userIdea,
    `for ${company.name}`,
    company.sector ? `, a ${company.sector} company` : "",
    company.description ? `. ${company.description}` : "",
    "Professional photography, sharp focus, dramatic lighting, photorealistic, 4K quality.",
    "NO text, NO words, NO letters, NO watermarks, NO logos in the image.",
  ];
  return parts.filter(Boolean).join(" ").slice(0, 800);
}
