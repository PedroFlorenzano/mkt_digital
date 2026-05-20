import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { fromIni } from "@aws-sdk/credential-providers";
import { prisma } from "./prisma";
import { join } from "path";
import { homedir } from "os";

// ---------------------------------------------------------------------------
// Configuração
// ---------------------------------------------------------------------------

const BEDROCK_PROFILE = "mktai";
const TEXT_REGION = process.env.AWS_BEDROCK_TEXT_REGION || "us-east-1";
const IMAGE_REGION = process.env.AWS_BEDROCK_IMAGE_REGION || "us-west-2";

const TEXT_MODEL_PRIMARY = "us.anthropic.claude-sonnet-4-6";
const TEXT_MODEL_FALLBACK = "us.anthropic.claude-haiku-4-5-20251001-v1:0";
const IMAGE_MODEL = "stability.stable-image-ultra-v1:1";

const TEXT_PRICING: Record<string, { inputPer1k: number; outputPer1k: number }> = {
  [TEXT_MODEL_PRIMARY]: { inputPer1k: 0.003, outputPer1k: 0.015 },
  [TEXT_MODEL_FALLBACK]: { inputPer1k: 0.0008, outputPer1k: 0.004 },
};

const IMAGE_PRICING = { perImage: 0.08 };

const awsDir = join(homedir(), ".aws");

// ---------------------------------------------------------------------------
// Credenciais AWS (profile)
// ---------------------------------------------------------------------------

function getCredentials() {
  return fromIni({
    profile: BEDROCK_PROFILE,
    filepath: join(awsDir, "credentials"),
    configFilepath: join(awsDir, "config"),
    ignoreCache: true,
  });
}

function getTextClient() {
  return new BedrockRuntimeClient({
    region: TEXT_REGION,
    credentials: getCredentials(),
  });
}

function getImageClient() {
  return new BedrockRuntimeClient({
    region: IMAGE_REGION,
    credentials: getCredentials(),
  });
}

// ---------------------------------------------------------------------------
// Exports públicos
// ---------------------------------------------------------------------------

export interface TextGenerationResult {
  options: { title: string; content: string }[];
  usage: {
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
    model: string;
  };
}

export async function generateTextWithBedrock(
  companyId: string,
  systemPrompt: string,
  userMessage: string,
  maxTokens: number = 2000,
): Promise<TextGenerationResult> {
  const client = getTextClient();
  const modelsToTry = [TEXT_MODEL_PRIMARY, TEXT_MODEL_FALLBACK];
  let lastError: Error | null = null;

  for (const modelId of modelsToTry) {
    try {
      const body = JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      });

      const command = new InvokeModelCommand({
        modelId,
        contentType: "application/json",
        accept: "application/json",
        body: Buffer.from(body),
      });

      const response = await client.send(command);
      const result = JSON.parse(new TextDecoder().decode(response.body));

      const inputTokens = result.usage?.input_tokens || 0;
      const outputTokens = result.usage?.output_tokens || 0;
      const pricing = TEXT_PRICING[modelId] ?? TEXT_PRICING[TEXT_MODEL_FALLBACK]!;
      const costUsd =
        (inputTokens / 1000) * pricing.inputPer1k +
        (outputTokens / 1000) * pricing.outputPer1k;

      await prisma.costLog.create({
        data: {
          companyId,
          type: "text",
          model: modelId,
          inputTokens,
          outputTokens,
          costUsd,
          metadata: JSON.stringify({ messageLength: userMessage.length }),
        },
      });

      const textContent = result.content?.[0]?.text || "";
      let parsed;
      try {
        const jsonMatch = textContent.match(/\{[\s\S]*\}/);
        parsed = JSON.parse(jsonMatch ? jsonMatch[0] : textContent);
      } catch {
        parsed = { options: [{ title: "Resposta", content: textContent }] };
      }

      console.log(`[bedrock/text] Modelo usado: ${modelId}`);
      return {
        options: parsed.options || [{ title: "Resposta", content: textContent }],
        usage: { inputTokens, outputTokens, costUsd, model: modelId },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isUseCaseError =
        message.includes("use case") ||
        message.includes("Model use case") ||
        message.includes("AccessDeniedException");

      if (isUseCaseError && modelId === TEXT_MODEL_PRIMARY) {
        console.warn(
          `[bedrock/text] ${modelId} bloqueado (use case), tentando fallback: ${TEXT_MODEL_FALLBACK}`
        );
        lastError = err instanceof Error ? err : new Error(message);
        continue;
      }

      throw err;
    }
  }

  throw lastError ?? new Error("Todos os modelos de texto falharam");
}

export interface ImageGenerationResult {
  images: string[];
  usage: {
    imagesGenerated: number;
    costUsd: number;
    model: string;
    aspectRatio: string;
  };
}

export async function generateImageWithBedrock(
  companyId: string,
  prompt: string,
  count: number = 3,
  aspectRatio: string = "1:1",
): Promise<ImageGenerationResult> {
  const client = getImageClient();
  const images: string[] = [];

  // Variações com estilos fotográficos profissionais — mantém o tema do prompt
  const variations = [
    `${prompt} Professional photography, sharp focus, dramatic lighting, photorealistic, high detail, commercial quality. Leave the bottom third of the image slightly darker or with space suitable for text overlay. No text, no words, no letters, no typography of any kind.`,
    `${prompt} Cinematic composition, golden hour lighting, vivid colors, ultra-realistic, 4K quality, professional product shot. Leave the bottom third of the image slightly darker or with space suitable for text overlay. No text, no words, no letters, no typography of any kind.`,
    `${prompt} Clean studio photography, bright natural light, modern aesthetic, high resolution, editorial quality. Leave the bottom third of the image slightly darker or with space suitable for text overlay. No text, no words, no letters, no typography of any kind.`,
  ];

  // Gera sequencialmente para evitar throttling e garantir 3 imagens
  for (let i = 0; i < count; i++) {
    let attempts = 0;
    const maxAttempts = 2;

    while (attempts < maxAttempts) {
      try {
        const body = JSON.stringify({
          prompt: variations[i] || prompt,
          negative_prompt:
            "text, words, letters, numbers, typography, watermark, caption, label, " +
            "title, subtitle, font, writing, inscription, sign, banner, overlay, " +
            "blurry, low quality, distorted, deformed",
          output_format: "png",
          aspect_ratio: aspectRatio,
        });

        const command = new InvokeModelCommand({
          modelId: IMAGE_MODEL,
          contentType: "application/json",
          accept: "application/json",
          body: Buffer.from(body),
        });

        const response = await client.send(command);
        const result = JSON.parse(new TextDecoder().decode(response.body));

        if (result.images?.length > 0) {
          images.push(`data:image/png;base64,${result.images[0]}`);
          break; // sucesso — próxima variação
        }
        attempts++;
      } catch (err) {
        attempts++;
        console.error(
          `[bedrock/image] Variação ${i + 1} tentativa ${attempts} falhou:`,
          err instanceof Error ? err.message : err
        );
        if (attempts < maxAttempts) {
          // Aguarda 1s antes de tentar novamente
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
    }
  }

  const costUsd = images.length * IMAGE_PRICING.perImage;

  await prisma.costLog.create({
    data: {
      companyId,
      type: "image",
      model: IMAGE_MODEL,
      images: images.length,
      costUsd,
      metadata: JSON.stringify({
        promptLength: prompt.length,
        requested: count,
        generated: images.length,
      }),
    },
  });

  console.log(`[bedrock/image] ${images.length}/${count} imagens geradas via AWS profile`);

  return {
    images,
    usage: { imagesGenerated: images.length, costUsd, model: IMAGE_MODEL, aspectRatio },
  };
}

/**
 * Image-to-image: applies professional style to a source image while
 * preserving the subject (product, person, scene). The `strength` parameter
 * controls how much the AI changes the image:
 *   0.0 = identical to source
 *   0.4 = light style transfer (keep subject, improve lighting/colour)
 *   0.7 = heavy transformation (subject preserved but scene/bg rebuilt)
 *   1.0 = ignores source completely (pure text-to-image)
 */
export async function styleTransferWithBedrock(
  companyId: string,
  sourceImageBase64: string,   // raw base64 without data: prefix
  prompt: string,
  strength = 0.45,             // conservative: keeps product recognisable
): Promise<{ imageBase64: string; costUsd: number }> {
  const client = getImageClient();

  const fullPrompt =
    `${prompt}, professional marketing photography, sharp focus, ` +
    `high quality commercial photo, clean background. ` +
    `No text, no words, no watermark.`;

  const negativePrompt =
    "text, words, letters, watermark, blurry, low quality, distorted, " +
    "deformed, different product, wrong color, wrong shape";

  let attempts = 0;
  const maxAttempts = 2;

  while (attempts < maxAttempts) {
    try {
      const body = JSON.stringify({
        prompt: fullPrompt,
        negative_prompt: negativePrompt,
        image: sourceImageBase64,   // SD Ultra image-to-image field
        strength,                   // 0-1: how much to change from source
        output_format: "jpeg",
        aspect_ratio: "1:1",
      });

      const command = new InvokeModelCommand({
        modelId: IMAGE_MODEL,
        contentType: "application/json",
        accept: "application/json",
        body: Buffer.from(body),
      });

      const response = await client.send(command);
      const result = JSON.parse(new TextDecoder().decode(response.body)) as {
        images?: string[];
      };

      if (result.images?.[0]) {
        const costUsd = IMAGE_PRICING.perImage;
        await prisma.costLog.create({
          data: {
            companyId,
            type: "video_transform",
            model: IMAGE_MODEL,
            images: 1,
            costUsd,
            metadata: JSON.stringify({ strength, promptLength: prompt.length }),
          },
        }).catch(() => {}); // non-fatal

        return { imageBase64: result.images[0], costUsd };
      }

      throw new Error("SD returned no image");
    } catch (err) {
      attempts++;
      console.error(
        `[bedrock/style-transfer] attempt ${attempts} failed:`,
        err instanceof Error ? err.message : err,
      );
      if (attempts < maxAttempts) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  throw new Error("Style transfer failed after all retries");
}
