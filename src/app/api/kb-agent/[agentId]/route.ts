/**
 * /api/kb-agent/[agentId]
 *
 * PUBLIC POST webhook — no authentication required.
 * Security relies on the unguessable CUID agent ID.
 *
 * Receives EvolutionAPI webhook payloads for Knowledge Base Agents.
 * Validates the payload, enforces guards, and invokes Bedrock with tool-use
 * loop for text messages. Audio messages receive a stub response.
 *
 * Always returns HTTP 200 to EvolutionAPI to prevent retries/duplication,
 * except when the agent is not found (returns HTTP 200 with a warning log).
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10, 5.11,
 *               6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 9.3, 9.4, 10.1, 10.2, 10.4
 */

import { NextResponse } from "next/server";
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { fromIni } from "@aws-sdk/credential-providers";
import { join } from "path";
import { homedir } from "os";
import { kbAgentRepository } from "@server/repositories/kbAgent.repository";
import { kbMessageRepository } from "@server/repositories/kbMessage.repository";
import {
  evolutionApiSendMessage,
  EvolutionAuthError,
} from "@server/lib/evolution-api";
import { resolveKBSystemPrompt, getTodayUTC } from "@server/lib/prompt-variables.kb";
import {
  searchToolService,
  type SearchFilters,
} from "@server/services/searchTool.service";
import { prisma } from "@server/lib/prisma";
import { logger } from "@server/lib/logger";

// ---------------------------------------------------------------------------
// Bedrock configuration
// ---------------------------------------------------------------------------

const BEDROCK_PROFILE = "mktai";
const TEXT_REGION = process.env.AWS_BEDROCK_TEXT_REGION || "us-east-1";

const MODEL_ID = "us.anthropic.claude-sonnet-4-6";
const MODEL_FALLBACK = "us.anthropic.claude-haiku-4-5-20251001-v1:0";

const PRICING: Record<string, { inputPer1k: number; outputPer1k: number }> = {
  [MODEL_ID]: { inputPer1k: 0.003, outputPer1k: 0.015 },
  [MODEL_FALLBACK]: { inputPer1k: 0.0008, outputPer1k: 0.004 },
};

function getBedrockClient(): BedrockRuntimeClient {
  const awsDir = join(homedir(), ".aws");
  return new BedrockRuntimeClient({
    region: TEXT_REGION,
    credentials: fromIni({
      profile: BEDROCK_PROFILE,
      filepath: join(awsDir, "credentials"),
      configFilepath: join(awsDir, "config"),
      ignoreCache: true,
    }),
  });
}

// ---------------------------------------------------------------------------
// Tool definition
// ---------------------------------------------------------------------------

const SEARCH_TOOL_DEFINITION = {
  name: "search_catalog",
  description:
    "Busca registros no catálogo da base de conhecimento aplicando filtros estruturados.",
  input_schema: {
    type: "object" as const,
    properties: {
      filters: {
        type: "object" as const,
        description:
          "Objeto de filtros onde cada chave é um campo filtrável do catálogo.",
        additionalProperties: true,
      },
    },
    required: [] as string[],
  },
};

// ---------------------------------------------------------------------------
// Bedrock message types (Claude Messages API)
// ---------------------------------------------------------------------------

interface TextContentBlock {
  type: "text";
  text: string;
}

interface ToolUseContentBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface ToolResultContentBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string;
}

type ContentBlock = TextContentBlock | ToolUseContentBlock | ToolResultContentBlock;

interface BedrockMessage {
  role: "user" | "assistant";
  content: string | ContentBlock[];
}

interface BedrockResponse {
  stop_reason: string;
  content: ContentBlock[];
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

// ---------------------------------------------------------------------------
// EvolutionAPI Webhook Payload Shape
// ---------------------------------------------------------------------------

interface EvolutionWebhookPayload {
  /** Top-level instance name — used for loop guard */
  instance?: string;
  data?: {
    key?: {
      remoteJid?: string | null;
      /** True when the message was sent by this agent/instance itself */
      fromMe?: boolean;
    };
    /** e.g. "conversation", "audioMessage", "pttMessage" */
    messageType?: string | null;
    message?: {
      conversation?: string | null;
      audioMessage?: { seconds?: number } | null;
      pttMessage?: { seconds?: number } | null;
    } | null;
    /** Display name of the WhatsApp contact */
    pushName?: string | null;
  };
}

// ---------------------------------------------------------------------------
// POST /api/kb-agent/[agentId]
// ---------------------------------------------------------------------------

export async function POST(
  request: Request,
  { params }: { params: Promise<{ agentId: string }> },
): Promise<NextResponse> {
  const { agentId } = await params;

  // ── Guard 1: Look up KBAgent ─────────────────────────────────────────────
  // Req 5.1, 9.3: return 200 with warning log when agent not found
  const agent = await kbAgentRepository.findById(agentId);
  if (!agent) {
    logger.warn("[kb-webhook] KBAgent not found — ignoring payload", {
      agentId,
    });
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  // ── Guard 2: Paused guard ─────────────────────────────────────────────────
  // Req 5.2, 9.3: return 200 immediately when agent is paused (< 100 ms)
  if (agent.status === "paused") {
    logger.info("[kb-webhook] Agent is paused — skipping", { agentId });
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: EvolutionWebhookPayload;
  try {
    body = (await request.json()) as EvolutionWebhookPayload;
  } catch {
    // Malformed JSON — return 200 to prevent EvolutionAPI from retrying
    logger.warn("[kb-webhook] Failed to parse request body", { agentId });
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  // ── Extract fields from payload ───────────────────────────────────────────
  const instanceName = body.instance;
  const remoteJid = body.data?.key?.remoteJid;
  const messageType = body.data?.messageType ?? null;
  const content = body.data?.message?.conversation ?? null;
  const contactName = body.data?.pushName ?? null;

  // Return 200 if required routing fields are missing
  if (instanceName == null || remoteJid == null || messageType == null) {
    logger.info("[kb-webhook] Missing required fields — skipping", {
      agentId,
      instanceName,
      remoteJid,
      messageType,
    });
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  // ── Guard 3: Loop guard ───────────────────────────────────────────────────
  // Req 5.3, 9.3: prevent self-loops — skip if remoteJid === instanceName
  if (remoteJid === agent.instanceName) {
    logger.info("[kb-webhook] Loop guard triggered — skipping", {
      agentId,
      remoteJid,
      instanceName: agent.instanceName,
    });
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  // ── Guard 4: Daily message limit ──────────────────────────────────────────
  // Req 5.3, 9.4: enforce maxMessagesPerDay per (agentId, remoteJid) per UTC day
  const todayCount = await kbMessageRepository.countTodayUserMessages(
    agentId,
    remoteJid,
  );
  if (todayCount >= agent.maxMessagesPerDay) {
    logger.info("[kb-webhook] Daily message limit reached — skipping", {
      agentId,
      remoteJid,
      todayCount,
      maxMessagesPerDay: agent.maxMessagesPerDay,
    });
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  // ── All guards passed — route by message type ─────────────────────────────

  // ── Task 10.3: Audio message handling (stub) ──────────────────────────────
  // Req 6.1, 6.4: detect audio, check duration, send stub error response
  if (messageType === "audioMessage" || messageType === "pttMessage") {
    const audioDuration =
      messageType === "audioMessage"
        ? (body.data?.message?.audioMessage?.seconds ?? 0)
        : (body.data?.message?.pttMessage?.seconds ?? 0);

    logger.info("[kb-webhook] Audio message received", {
      agentId,
      remoteJid,
      messageType,
      durationSeconds: audioDuration,
    });

    // Req 6.4: audio > 300 s → send warning and return
    if (audioDuration > 300) {
      logger.info("[kb-webhook] Audio duration exceeds 300 s — sending warning", {
        agentId,
        remoteJid,
        durationSeconds: audioDuration,
      });
      try {
        await evolutionApiSendMessage({
          baseUrl: agent.evolutionApiUrl,
          apiKey: agent.evolutionApiKey,
          instanceName: agent.instanceName,
          remoteJid,
          text: "Áudio muito longo. Por favor, envie um áudio com duração máxima de 5 minutos.",
        });
      } catch (sendErr) {
        logger.error("[kb-webhook] Failed to send audio duration warning", sendErr, {
          agentId,
          remoteJid,
        });
      }
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    // Simplified stub: audio transcription not yet implemented
    logger.info("[kb-webhook] Audio transcription not yet implemented", {
      agentId,
      remoteJid,
      messageType,
    });
    try {
      await evolutionApiSendMessage({
        baseUrl: agent.evolutionApiUrl,
        apiKey: agent.evolutionApiKey,
        instanceName: agent.instanceName,
        remoteJid,
        text: "Mensagens de áudio ainda não são suportadas nesta versão.",
      });
    } catch (sendErr) {
      logger.error("[kb-webhook] Failed to send audio unsupported message", sendErr, {
        agentId,
        remoteJid,
      });
    }
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  // ── Task 10.2: Text message processing ───────────────────────────────────
  // Req 5.4: only process "conversation" type
  if (messageType !== "conversation") {
    logger.info("[kb-webhook] Unhandled messageType — skipping", {
      agentId,
      messageType,
    });
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  if (!content || content.trim() === "") {
    logger.info("[kb-webhook] Empty conversation content — skipping", { agentId });
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  // ── Persist user message ──────────────────────────────────────────────────
  // Req 5.4: persist before invoking Bedrock
  await kbMessageRepository.save({
    agentId,
    remoteJid,
    contactName,
    role: "user",
    content,
    messageType: "text",
  });

  // ── Load conversation history (last 20) ───────────────────────────────────
  // Req 5.5
  const historyRecords = await kbMessageRepository.getHistory(agentId, remoteJid, 20);

  // Build Bedrock message history (exclude the message we just persisted — it's
  // the last one; we'll append it fresh below to avoid duplication since
  // getHistory returns it already)
  const historyMessages: BedrockMessage[] = historyRecords
    .slice(0, -1) // drop last (the user message we just saved)
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

  // ── Resolve system prompt ─────────────────────────────────────────────────
  // Req 5.8: substitute {{agentName}} and {{today}}
  const resolvedSystemPrompt = resolveKBSystemPrompt(
    agent.systemPrompt,
    agent.name,
    getTodayUTC(),
  );

  // ── Bedrock tool-use loop ─────────────────────────────────────────────────
  // Req 5.6, 5.7, 5.9: run loop until end_turn; call searchToolService on tool_use
  let messages: BedrockMessage[] = [
    ...historyMessages,
    { role: "user", content },
  ];

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let finalText = "";
  let usedModel = MODEL_ID;

  const client = getBedrockClient();

  // Try primary model first; fall back on use-case/access errors
  let modelId = MODEL_ID;

  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const requestBody = {
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 2000,
        system: resolvedSystemPrompt,
        messages,
        tools: [SEARCH_TOOL_DEFINITION],
      };

      let responseBody: BedrockResponse;
      try {
        const command = new InvokeModelCommand({
          modelId,
          contentType: "application/json",
          accept: "application/json",
          body: Buffer.from(JSON.stringify(requestBody)),
        });
        const raw = await client.send(command);
        responseBody = JSON.parse(
          new TextDecoder().decode(raw.body),
        ) as BedrockResponse;
        usedModel = modelId;
      } catch (invokeErr) {
        const errMsg =
          invokeErr instanceof Error ? invokeErr.message : String(invokeErr);
        const isUseCaseError =
          errMsg.includes("use case") ||
          errMsg.includes("Model use case") ||
          errMsg.includes("AccessDeniedException");

        if (isUseCaseError && modelId === MODEL_ID) {
          logger.warn(
            "[kb-webhook] Primary model blocked (use case), switching to fallback",
            { agentId, remoteJid },
          );
          modelId = MODEL_FALLBACK;
          continue; // retry with fallback
        }
        throw invokeErr; // rethrow non-use-case errors
      }

      // Accumulate tokens
      totalInputTokens += responseBody.usage?.input_tokens ?? 0;
      totalOutputTokens += responseBody.usage?.output_tokens ?? 0;

      if (responseBody.stop_reason === "tool_use") {
        // Find the tool_use block
        const toolUseBlock = responseBody.content.find(
          (c): c is ToolUseContentBlock => c.type === "tool_use",
        );

        if (!toolUseBlock) {
          // Unexpected: no tool_use block despite stop_reason; break out
          logger.warn("[kb-webhook] stop_reason=tool_use but no tool_use block found", {
            agentId,
            remoteJid,
          });
          finalText =
            responseBody.content.find(
              (c): c is TextContentBlock => c.type === "text",
            )?.text ?? "";
          break;
        }

        const toolInput = (toolUseBlock.input as { filters?: SearchFilters }) ?? {};
        const filters: SearchFilters = toolInput.filters ?? {};

        logger.info("[kb-webhook] Executing search_catalog tool", {
          agentId,
          remoteJid,
          toolUseId: toolUseBlock.id,
          filters,
        });

        // Execute search
        let searchResults: unknown[] = [];
        try {
          searchResults = await searchToolService.search(
            agent.knowledgeBaseId,
            filters,
          );
        } catch (searchErr) {
          logger.error("[kb-webhook] searchToolService.search failed", searchErr, {
            agentId,
            remoteJid,
          });
          searchResults = [];
        }

        // Append assistant's tool_use response to conversation
        messages = [
          ...messages,
          {
            role: "assistant",
            content: responseBody.content,
          },
          {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: toolUseBlock.id,
                content: JSON.stringify(searchResults),
              },
            ],
          },
        ];

        // Continue loop for next Bedrock call
        continue;
      }

      // stop_reason === "end_turn" or other — extract final text
      finalText =
        responseBody.content.find(
          (c): c is TextContentBlock => c.type === "text",
        )?.text ?? "";
      break;
    }
  } catch (bedrockErr) {
    logger.error("[kb-webhook] Bedrock tool-use loop failed", bedrockErr, {
      agentId,
      remoteJid,
    });
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  if (!finalText || finalText.trim() === "") {
    logger.warn("[kb-webhook] Bedrock returned empty final text", {
      agentId,
      remoteJid,
    });
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  // ── Send response via EvolutionAPI ────────────────────────────────────────
  // Req 5.9: wait delaySeconds before sending
  await new Promise((resolve) => setTimeout(resolve, agent.delaySeconds * 1000));

  try {
    await evolutionApiSendMessage({
      baseUrl: agent.evolutionApiUrl,
      apiKey: agent.evolutionApiKey,
      instanceName: agent.instanceName,
      remoteJid,
      text: finalText,
    });
  } catch (sendErr) {
    if (sendErr instanceof EvolutionAuthError) {
      logger.error("[kb-webhook] EvolutionAPI auth error — cannot send reply", sendErr, {
        agentId,
        remoteJid,
      });
    } else {
      logger.error("[kb-webhook] EvolutionAPI send failed", sendErr, {
        agentId,
        remoteJid,
      });
    }
    // Still persist tokens / cost log even if send fails
  }

  // ── Persist assistant message ─────────────────────────────────────────────
  // Req 5.10: persist after sending
  await kbMessageRepository.save({
    agentId,
    remoteJid,
    contactName: null,
    role: "assistant",
    content: finalText,
    messageType: "text",
  });

  // ── Task 10.4: Write CostLog ──────────────────────────────────────────────
  // Req 5.11, 10.1, 10.2: write cost log with accumulated tokens
  try {
    const pricing = PRICING[usedModel] ?? PRICING[MODEL_FALLBACK]!;
    const costUsd =
      (totalInputTokens / 1000) * pricing.inputPer1k +
      (totalOutputTokens / 1000) * pricing.outputPer1k;

    await prisma.costLog.create({
      data: {
        companyId: agent.companyId,
        type: "kb_agent_text",
        model: usedModel,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        costUsd,
        metadata: JSON.stringify({ agentId, remoteJid }),
      },
    });
  } catch (costErr) {
    // Non-fatal — log but continue
    logger.error("[kb-webhook] Failed to write CostLog", costErr, {
      agentId,
      remoteJid,
    });
  }

  // ── Always return 200 ─────────────────────────────────────────────────────
  return NextResponse.json({ ok: true }, { status: 200 });
}
