import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { fromIni } from "@aws-sdk/credential-providers";
import { prisma } from "./prisma";
import { join } from "path";
import { homedir } from "os";

const BEDROCK_PROFILE = "mktai";
const TEXT_REGION = process.env.AWS_BEDROCK_TEXT_REGION || "us-east-1";
const IMAGE_REGION = process.env.AWS_BEDROCK_IMAGE_REGION || "us-west-2";

const TEXT_MODEL = "us.anthropic.claude-sonnet-4-6";
const IMAGE_MODEL = "stability.stable-image-core-v1:1";

const TEXT_PRICING = {
  inputPer1k: 0.003,
  outputPer1k: 0.015,
};

const IMAGE_PRICING = {
  perImage: 0.04,
};

const awsDir = join(homedir(), ".aws");

// Force the eqtai profile regardless of any AWS_PROFILE env var
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
): Promise<TextGenerationResult> {
  const client = getTextClient();

  const body = JSON.stringify({
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: 2000,
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

  const inputTokens = result.usage?.input_tokens || 0;
  const outputTokens = result.usage?.output_tokens || 0;
  const costUsd =
    (inputTokens / 1000) * TEXT_PRICING.inputPer1k +
    (outputTokens / 1000) * TEXT_PRICING.outputPer1k;

  await prisma.costLog.create({
    data: {
      companyId,
      type: "text",
      model: TEXT_MODEL,
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

  return {
    options: parsed.options || [{ title: "Resposta", content: textContent }],
    usage: { inputTokens, outputTokens, costUsd, model: TEXT_MODEL },
  };
}

export interface ImageGenerationResult {
  images: string[];
  usage: {
    imagesGenerated: number;
    costUsd: number;
    model: string;
  };
}

export async function generateImageWithBedrock(
  companyId: string,
  prompt: string,
  count: number = 3,
): Promise<ImageGenerationResult> {
  const client = getImageClient();
  const images: string[] = [];

  const variations = [
    `${prompt} Minimalist composition, soft lighting, clean design.`,
    `${prompt} Vibrant colors, geometric shapes, bold and eye-catching.`,
    `${prompt} Elegant and sophisticated, subtle gradients, premium feel.`,
  ];

  for (let i = 0; i < count; i++) {
    const body = JSON.stringify({
      prompt: variations[i] || prompt,
      output_format: "png",
      aspect_ratio: "1:1",
    });

    const command = new InvokeModelCommand({
      modelId: IMAGE_MODEL,
      contentType: "application/json",
      accept: "application/json",
      body: Buffer.from(body),
    });

    try {
      const response = await client.send(command);
      const result = JSON.parse(new TextDecoder().decode(response.body));

      if (result.images && result.images.length > 0) {
        images.push(`data:image/png;base64,${result.images[0]}`);
      }
    } catch (err) {
      console.error(`[bedrock/image] Variação ${i + 1} falhou:`, err instanceof Error ? err.message : err);
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
      metadata: JSON.stringify({ promptLength: prompt.length, requested: count, generated: images.length }),
    },
  });

  return {
    images,
    usage: { imagesGenerated: images.length, costUsd, model: IMAGE_MODEL },
  };
}
