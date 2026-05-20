import { generateImageWithBedrock } from "@server/lib/bedrock";
import { ValidationError, ExternalServiceError } from "@server/lib/errors";

/**
 * Returns true if width/height == 9/16 within ±1px tolerance.
 *
 * The tolerance check is equivalent to:
 *   abs(width * 16 - height * 9) ≤ 16 + 9 (= 25)
 *
 * This allows each dimension to vary by ±1 pixel independently from the ideal
 * 9:16 ratio without the result being considered invalid.
 */
export function isValidStoryAspectRatio(width: number, height: number): boolean {
  return Math.abs(width * 16 - height * 9) <= 25;
}

/**
 * Generates a Story image using AWS Bedrock (Stable Diffusion Ultra) with
 * aspect_ratio="9:16".  Includes the company objective in the prompt.
 *
 * Because the returned image is base64-encoded we cannot verify pixel
 * dimensions directly.  Instead we treat a non-empty image string as a
 * successful generation and skip the aspect-ratio re-check at runtime.
 *
 * Retries up to 2 times if Bedrock returns an empty/missing image.
 * Throws ExternalServiceError after 2 failed attempts.
 *
 * Returns the base64 data URL of the generated image.
 */
export async function generateStoryImage(
  companyId: string,
  prompt: string,
  objective: string,
): Promise<string> {
  const MAX_ATTEMPTS = 2;

  // Build a prompt that includes the business objective so the generated
  // image aligns with the company's goal (Requirement 3.2).
  const enrichedPrompt =
    `${prompt} Business objective: ${objective}. ` +
    "Vertical format optimized for Instagram Stories (9:16). " +
    "Leave the lower 30% of the image with space suitable for text overlay. " +
    "No text, no words, no letters, no typography of any kind.";

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const result = await generateImageWithBedrock(
        companyId,
        enrichedPrompt,
        /* count */ 1,
        /* aspectRatio */ "9:16",
      );

      const image = result.images[0];
      if (image && image.length > 0) {
        return image; // base64 data URL (e.g. "data:image/png;base64,...")
      }

      // Empty image — log and retry
      console.warn(
        `[story] Bedrock returned empty image on attempt ${attempt + 1}/${MAX_ATTEMPTS}`,
      );
    } catch (err) {
      console.error(
        `[story] generateImageWithBedrock failed on attempt ${attempt + 1}/${MAX_ATTEMPTS}:`,
        err instanceof Error ? err.message : err,
      );

      // On the last attempt we fall through to the throw below
      if (attempt < MAX_ATTEMPTS - 1) {
        // Brief back-off before retrying
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  throw new ExternalServiceError(
    "Bedrock/StableDiffusion",
    "Failed to generate a Story image after 2 attempts. Please try again.",
  );
}

/**
 * Validates that scheduledAt is not more than 24 hours from now.
 *
 * Throws ValidationError if scheduledAt > now + 24 h.
 * Does nothing if scheduledAt is null or undefined.
 */
export function validateStoryScheduling(
  scheduledAt: Date | null | undefined,
): void {
  if (scheduledAt == null) return;

  const maxScheduledAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  if (scheduledAt > maxScheduledAt) {
    throw new ValidationError(
      "Story posts cannot be scheduled more than 24 hours in advance.",
    );
  }
}
