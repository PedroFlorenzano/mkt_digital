/**
 * evolution-api.ts
 *
 * Client for the EvolutionAPI WhatsApp middleware.
 * Sends text message parts to a WhatsApp contact via a configured instance.
 *
 * Errors:
 *   - EvolutionAuthError (extends AppError, statusCode 401) on HTTP 401/403 responses.
 *   - ExternalServiceError (HTTP 502) on any other HTTP failure or network error.
 */

import { AppError, ExternalServiceError } from "@server/lib/errors";
import { logger } from "@server/lib/logger";

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

/**
 * Thrown when EvolutionAPI responds with HTTP 401 or 403.
 * The webhook handler catches this to stop sending remaining message parts.
 */
export class EvolutionAuthError extends AppError {
  constructor(message: string) {
    super("EVOLUTION_AUTH_ERROR", message, 401);
    this.name = "EvolutionAuthError";
  }
}

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface SendMessageOptions {
  /** Base URL of the EvolutionAPI instance, e.g. "https://api.example.com" */
  baseUrl: string;
  /** API key configured in the WhatsApp_Agent */
  apiKey: string;
  /** EvolutionAPI instance name configured in the WhatsApp_Agent */
  instanceName: string;
  /** Recipient identifier, e.g. "5511999999999@s.whatsapp.net" */
  remoteJid: string;
  /** The text content to send */
  text: string;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Sends a text message to a WhatsApp contact via EvolutionAPI.
 *
 * @throws {EvolutionAuthError} when EvolutionAPI responds with HTTP 401 or 403.
 * @throws {ExternalServiceError} on other HTTP failures or network errors.
 */
export async function evolutionApiSendMessage(
  options: SendMessageOptions,
): Promise<void> {
  const { baseUrl, apiKey, instanceName, remoteJid, text } = options;

  // Strip trailing slash to avoid double-slash in the URL
  const base = baseUrl.replace(/\/+$/, "");
  const url = `${base}/message/sendText/${encodeURIComponent(instanceName)}`;

  const body = JSON.stringify({ number: remoteJid, text });

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: apiKey,
      },
      body,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("[evolution-api] Network error sending message", { instanceName, remoteJid, error: msg });
    throw new ExternalServiceError("EvolutionAPI", `Network error: ${msg}`);
  }

  if (res.status === 401 || res.status === 403) {
    logger.error("[evolution-api] Authentication error", {
      instanceName,
      remoteJid,
      status: res.status,
    });
    throw new EvolutionAuthError(
      `EvolutionAPI authentication failed (HTTP ${res.status}) for instance "${instanceName}"`,
    );
  }

  if (!res.ok) {
    let detail = "";
    try {
      const responseBody = await res.text();
      detail = responseBody.slice(0, 300);
    } catch {
      // ignore body parse failure
    }
    logger.error("[evolution-api] HTTP error sending message", {
      instanceName,
      remoteJid,
      status: res.status,
      detail,
    });
    throw new ExternalServiceError(
      "EvolutionAPI",
      `HTTP ${res.status} from ${url}: ${detail}`,
    );
  }
}
