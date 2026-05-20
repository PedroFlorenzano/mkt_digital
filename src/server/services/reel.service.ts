import { ValidationError } from "@server/lib/errors";

export interface ReelPublishInput {
  videoUrl: string; // must be a non-empty string
  durationSeconds: number; // must be 15–60 inclusive
  platform: string; // must be "instagram"
  socialAccountConnected: boolean; // must be true
}

/**
 * Returns true if durationSeconds is in [15, 60], false otherwise.
 * Pure predicate, no side effects.
 */
export function isValidReelDuration(durationSeconds: number): boolean {
  return durationSeconds >= 15 && durationSeconds <= 60;
}

/**
 * Validates all preconditions for publishing a Reel to Instagram.
 * Throws ValidationError with a descriptive message if any condition fails:
 *   - platform !== "instagram": "Reels só podem ser publicados no Instagram"
 *   - !socialAccountConnected: "Conta do Instagram não conectada"
 *   - !videoUrl or videoUrl.trim() === "": "URL do vídeo é obrigatória"
 *   - durationSeconds < 15 || durationSeconds > 60:
 *     "Duração inválida: ${durationSeconds}s. O Reel deve ter entre 15 e 60 segundos."
 */
export function validateReelPublish(input: ReelPublishInput): void {
  if (input.platform !== "instagram") {
    throw new ValidationError("Reels só podem ser publicados no Instagram");
  }

  if (!input.socialAccountConnected) {
    throw new ValidationError("Conta do Instagram não conectada");
  }

  if (!input.videoUrl || input.videoUrl.trim() === "") {
    throw new ValidationError("URL do vídeo é obrigatória");
  }

  if (!isValidReelDuration(input.durationSeconds)) {
    throw new ValidationError(
      `Duração inválida: ${input.durationSeconds}s. O Reel deve ter entre 15 e 60 segundos.`,
    );
  }
}
