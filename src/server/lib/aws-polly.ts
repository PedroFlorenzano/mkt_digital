/**
 * aws-polly.ts
 *
 * Wrapper around the Amazon Polly Text-to-Speech service.
 * Synthesises narration scripts in Brazilian Portuguese (pt-BR).
 *
 * Supported voices:
 *   - Camila  (female, pt-BR) — default
 *   - Ricardo (male,   pt-BR)
 */

import {
  PollyClient,
  SynthesizeSpeechCommand,
  type VoiceId,
} from "@aws-sdk/client-polly";
import type { Readable } from "node:stream";
import { videoEnv } from "@server/lib/video-env";
import { ExternalServiceError } from "@server/lib/errors";
import { logger } from "@server/lib/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PollyVoice = "Camila" | "Ricardo";

export interface PollyConfig {
  voice: PollyVoice;
  text: string;
  outputFormat: "mp3";
  sampleRate: "22050";
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

let _pollyClient: PollyClient | null = null;

function getPollyClient(): PollyClient {
  if (!_pollyClient) {
    _pollyClient = new PollyClient({ region: videoEnv.pollyRegion });
  }
  return _pollyClient;
}

// ---------------------------------------------------------------------------
// synthesizeSpeech
// ---------------------------------------------------------------------------

/**
 * Calls Amazon Polly and returns the synthesised MP3 audio as a Buffer.
 *
 * @param config  Voice, text and audio format configuration
 * @returns       Raw MP3 bytes
 * @throws        ExternalServiceError if Polly fails
 */
export async function synthesizeSpeech(config: PollyConfig): Promise<Buffer> {
  const { voice, text, outputFormat, sampleRate } = config;

  if (!text.trim()) {
    throw new Error("[aws-polly] Cannot synthesise empty text.");
  }

  logger.info("[aws-polly] Synthesising speech", {
    voice,
    charCount: text.length,
  });

  try {
    const command = new SynthesizeSpeechCommand({
      VoiceId: voice as VoiceId,
      Text: text,
      OutputFormat: outputFormat,
      SampleRate: sampleRate,
      LanguageCode: "pt-BR",
    });

    const response = await getPollyClient().send(command);

    if (!response.AudioStream) {
      throw new Error("Polly returned an empty AudioStream");
    }

    // Collect stream into Buffer
    const stream = response.AudioStream as Readable;
    const chunks: Buffer[] = [];

    await new Promise<void>((resolve, reject) => {
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("end", resolve);
      stream.on("error", reject);
    });

    const audio = Buffer.concat(chunks);

    logger.info("[aws-polly] Speech synthesised", {
      voice,
      charCount: text.length,
      audioBytes: audio.length,
    });

    return audio;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("[aws-polly] Synthesis failed", err, { voice, charCount: text.length });
    throw new ExternalServiceError("Amazon Polly", message);
  }
}
