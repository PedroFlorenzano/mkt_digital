/**
 * /api/whatsapp-agent/[agentId]
 *
 * PUBLIC POST webhook — no authentication required.
 * Security relies on the unguessable CUID agent ID.
 *
 * Receives EvolutionAPI webhook payloads, validates them, invokes Bedrock,
 * and sends AI responses back via EvolutionAPI.
 *
 * Always returns HTTP 200 to EvolutionAPI to prevent retries/duplication,
 * except when the agent is not found (HTTP 404).
 *
 * Requirements: 3.1–3.18
 */

import { NextResponse } from "next/server";
import { agentService } from "@server/services/agent.service";
import { conversationService } from "@server/services/conversation.service";
import {
  invokeConversationWithBedrock,
  type ConversationMessage,
} from "@server/lib/bedrock";
import {
  evolutionApiSendMessage,
  EvolutionAuthError,
} from "@server/lib/evolution-api";
import { substitutePromptVariables } from "@server/lib/prompt-variables";
import { splitMessage } from "@server/lib/message-splitter";
import { prisma } from "@server/lib/prisma";
import { logger } from "@server/lib/logger";

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
    /** e.g. "conversation", "imageMessage", etc. */
    messageType?: string | null;
    message?: {
      conversation?: string | null;
    } | null;
    /** Display name of the WhatsApp contact */
    pushName?: string | null;
  };
}

// ---------------------------------------------------------------------------
// Helper: extract agentId from URL path
// Path shape: /api/whatsapp-agent/[agentId]
// ---------------------------------------------------------------------------

function extractAgentId(url: string): string | null {
  const segments = new URL(url).pathname.split("/");
  // segments: ["", "api", "whatsapp-agent", "<agentId>", ...]
  const baseIndex = segments.indexOf("whatsapp-agent");
  const id = baseIndex >= 0 ? (segments[baseIndex + 1] ?? null) : null;
  return id && id !== "" ? id : null;
}

// ---------------------------------------------------------------------------
// Helper: sleep for ms milliseconds
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// POST /api/whatsapp-agent/[agentId]
// ---------------------------------------------------------------------------

export async function POST(request: Request): Promise<NextResponse> {
  // ── 1. Extract agentId from URL ──────────────────────────────────────────
  const agentId = extractAgentId(request.url);
  if (!agentId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // ── 2. Look up agent ─────────────────────────────────────────────────────
  const agent = await agentService.getById(agentId);
  if (!agent) {
    // Req 3.3: return 404 when agent not found
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  // ── 3. Paused guard ───────────────────────────────────────────────────────
  // Req 3.4: return 200 immediately when agent is paused
  if (agent.status === "paused") {
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  // ── 4. Parse body ─────────────────────────────────────────────────────────
  let body: EvolutionWebhookPayload;
  try {
    body = (await request.json()) as EvolutionWebhookPayload;
  } catch {
    // Malformed JSON — return 200 to prevent EvolutionAPI from retrying
    logger.warn("[webhook] Failed to parse request body", { agentId });
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  // ── 5. Extract required fields ────────────────────────────────────────────
  // Req 3.5: validate that all required fields are present and non-null
  const instance = body.instance;
  const remoteJid = body.data?.key?.remoteJid;
  const fromMe = body.data?.key?.fromMe;
  const messageType = body.data?.messageType;
  const conversation = body.data?.message?.conversation;
  const pushName = body.data?.pushName;

  // Return 200 if any required field is missing/null
  if (
    instance == null ||
    remoteJid == null ||
    messageType == null
  ) {
    logger.info("[webhook] Missing required fields — skipping", {
      agentId,
      instance,
      remoteJid,
      messageType,
    });
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  // ── 6. Message type and content guards ────────────────────────────────────
  // Req 3.6: only process "conversation" type messages with non-empty content
  if (messageType !== "conversation") {
    logger.info("[webhook] Non-conversation messageType — skipping", {
      agentId,
      messageType,
    });
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  if (!conversation || conversation.trim() === "") {
    logger.info("[webhook] Empty conversation content — skipping", { agentId });
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  // ── 7. Loop guard ─────────────────────────────────────────────────────────
  // Req 3.7: prevent self-loops — skip if message was sent by this agent
  if (fromMe === true || instance === agent.instanceName) {
    logger.info("[webhook] Loop guard triggered — skipping", {
      agentId,
      fromMe,
      instance,
      instanceName: agent.instanceName,
    });
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  // ── 8. Daily session limit ────────────────────────────────────────────────
  // Req 3.15: enforce maxMessagesPerSession per day (UTC)
  const todayCount = await conversationService.countTodayMessages(agentId, remoteJid);
  if (todayCount >= agent.maxMessagesPerSession) {
    logger.info("[webhook] Daily session limit reached — skipping", {
      agentId,
      remoteJid,
      todayCount,
      maxMessagesPerSession: agent.maxMessagesPerSession,
    });
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  // ── 9. Persist user message ───────────────────────────────────────────────
  // Req 3.8: save incoming message before invoking Bedrock
  await conversationService.saveMessage({
    agentId,
    remoteJid,
    contactName: pushName ?? null,
    role: "user",
    content: conversation,
  });

  // ── 10. Load conversation history ─────────────────────────────────────────
  // Req 3.9: retrieve full Conversation_Memory for this remoteJid
  const history = await conversationService.getHistory(agentId, remoteJid);

  // ── 11. Substitute system prompt variables ────────────────────────────────
  // Req 3.10: replace {{agentName}} and {{today}} in systemPrompt
  const systemPrompt = substitutePromptVariables(agent.systemPrompt, agent.name);

  // ── 12. Invoke Bedrock ────────────────────────────────────────────────────
  // Req 3.1, 3.17: call Bedrock with full history; log errors and return 200 on failure
  let bedrockResult: Awaited<ReturnType<typeof invokeConversationWithBedrock>>;
  try {
    const messages: ConversationMessage[] = history.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    bedrockResult = await invokeConversationWithBedrock(systemPrompt, messages);
  } catch (bedrockErr) {
    // Req 3.17: log Bedrock error server-side, return 200 without sending reply
    logger.error("[webhook] Bedrock invocation failed", bedrockErr, {
      agentId,
      remoteJid,
    });
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  const aiText = bedrockResult.text;

  // ── 13. Split AI response into parts ─────────────────────────────────────
  // Req 3.11: split by backslash, filter empty parts
  const parts = splitMessage(aiText);

  // ── 14. Send parts via EvolutionAPI, persist each, stop on auth error ─────
  // Req 3.12, 3.13, 3.14, 3.16, 3.18
  for (const part of parts) {
    // Wait delaySeconds before each send
    await sleep(agent.delaySeconds * 1000);

    try {
      await evolutionApiSendMessage({
        baseUrl: agent.evolutionApiUrl,
        apiKey: agent.evolutionApiKey,
        instanceName: agent.instanceName,
        remoteJid,
        text: part,
      });
    } catch (sendErr) {
      if (sendErr instanceof EvolutionAuthError) {
        // Req 3.18: auth error → stop sending remaining parts, return 200
        logger.error("[webhook] EvolutionAPI auth error — stopping message send", sendErr, {
          agentId,
          remoteJid,
        });
        break;
      }

      // Req 3.16: non-auth send failure → log and continue with remaining parts
      logger.error("[webhook] EvolutionAPI send failed (non-auth) — continuing", sendErr, {
        agentId,
        remoteJid,
      });
      // Still persist the assistant message even if send failed? Per design, we persist
      // after each *successfully sent* part. Skip persistence on send failure.
      continue;
    }

    // Req 3.14: persist each successfully sent part as assistant message
    await conversationService.saveMessage({
      agentId,
      remoteJid,
      contactName: null,
      role: "assistant",
      content: part,
    });
  }

  // ── 15. Write CostLog ─────────────────────────────────────────────────────
  // Req 3.13, 5.1, 5.2: log Bedrock cost with type = "whatsapp_agent"
  try {
    await prisma.costLog.create({
      data: {
        companyId: agent.companyId,
        type: "whatsapp_agent",
        model: bedrockResult.usage.model,
        inputTokens: bedrockResult.usage.inputTokens,
        outputTokens: bedrockResult.usage.outputTokens,
        costUsd: bedrockResult.usage.costUsd,
        metadata: JSON.stringify({
          agentId,
          remoteJid,
          partsCount: parts.length,
        }),
      },
    });
  } catch (costErr) {
    // Non-fatal — log but do not rethrow
    logger.error("[webhook] Failed to write CostLog", costErr, {
      agentId,
      remoteJid,
    });
  }

  // ── 16. Always return 200 ─────────────────────────────────────────────────
  // Req 3.1: respond HTTP 200 to EvolutionAPI in all non-404 cases
  return NextResponse.json({ ok: true }, { status: 200 });
}
