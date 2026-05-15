/**
 * Credential service — stores, retrieves and manages ad platform credentials.
 *
 * Credentials are encrypted at rest using AES-256-GCM (via credential-crypto lib).
 * Decrypted values are NEVER logged.
 */

import { prisma } from "@server/lib/prisma";
import {
  encryptCredential,
  decryptCredential,
  serializeBlob,
  deserializeBlob,
} from "@server/lib/credential-crypto";
import { NotFoundError } from "@server/lib/errors";
import { logger } from "@server/lib/logger";
import type { AdPlatformCredential } from "@prisma/client";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type AdPlatform = "meta" | "google";

export interface RawCredentialData {
  // Meta Ads
  appId?: string;
  appSecret?: string;
  accessToken?: string;
  adAccountId?: string;
  // Google Ads
  developerToken?: string;
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  customerId?: string;
}

export interface DecryptedCredential {
  platform: AdPlatform;
  fields: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const credentialService = {
  /**
   * Saves (creates or replaces) an ad platform credential for a company.
   *
   * - Serializes RawCredentialData as JSON
   * - Encrypts the JSON string with AES-256-GCM
   * - Upserts in DB using the [companyId, platform] unique constraint
   * - Always resets isValid=false / validatedAt=null so new credentials must
   *   be re-validated before use
   */
  async save(
    companyId: string,
    platform: AdPlatform,
    data: RawCredentialData,
  ): Promise<AdPlatformCredential> {
    const plaintext = JSON.stringify(data);
    const blob = encryptCredential(plaintext);
    const encryptedData = serializeBlob(blob);

    const record = await prisma.adPlatformCredential.upsert({
      where: {
        companyId_platform: { companyId, platform },
      },
      create: {
        companyId,
        platform,
        encryptedData,
        isValid: false,
        validatedAt: null,
      },
      update: {
        encryptedData,
        isValid: false,
        validatedAt: null,
      },
    });

    logger.info("[credential] Saved", { companyId, platform });
    return record;
  },

  /**
   * Retrieves and decrypts a credential.
   *
   * Throws NotFoundError if the credential for the given company/platform does
   * not exist. Decrypted values are never written to logs.
   */
  async get(
    companyId: string,
    platform: AdPlatform,
  ): Promise<DecryptedCredential> {
    const record = await prisma.adPlatformCredential.findUnique({
      where: {
        companyId_platform: { companyId, platform },
      },
    });

    if (!record) {
      throw new NotFoundError(`Credencial ${platform} não encontrada.`);
    }

    const blob = deserializeBlob(record.encryptedData);
    const plaintext = decryptCredential(blob);
    // Parse back to RawCredentialData — treat every value as string
    const fields = JSON.parse(plaintext) as Record<string, string>;

    // IMPORTANT: do not log `fields` — it contains sensitive credential values
    return { platform, fields };
  },

  /**
   * Permanently deletes a credential record.
   * Throws NotFoundError if the record does not exist.
   */
  async delete(companyId: string, platform: AdPlatform): Promise<void> {
    const record = await prisma.adPlatformCredential.findUnique({
      where: {
        companyId_platform: { companyId, platform },
      },
    });

    if (!record) {
      throw new NotFoundError(`Credencial ${platform} não encontrada.`);
    }

    await prisma.adPlatformCredential.delete({
      where: {
        companyId_platform: { companyId, platform },
      },
    });

    // Log at info level — no credential values are referenced here
    logger.info("[credential] Deleted", { companyId, platform });
  },

  /**
   * Marks a credential as valid after successful external API validation.
   * Sets isValid=true and records the validation timestamp.
   */
  async markValid(
    companyId: string,
    platform: AdPlatform,
  ): Promise<AdPlatformCredential> {
    const record = await prisma.adPlatformCredential.update({
      where: {
        companyId_platform: { companyId, platform },
      },
      data: {
        isValid: true,
        validatedAt: new Date(),
      },
    });

    logger.info("[credential] Marked valid", { companyId, platform });
    return record;
  },

  /**
   * Marks a credential as invalid (e.g. after failed external API validation).
   * Logs the reason without including any credential values.
   */
  async markInvalid(
    companyId: string,
    platform: AdPlatform,
    reason: string,
  ): Promise<void> {
    await prisma.adPlatformCredential.update({
      where: {
        companyId_platform: { companyId, platform },
      },
      data: {
        isValid: false,
      },
    });

    // Log reason at warn level — safe because reason describes the validation
    // outcome, not the credential values themselves
    logger.warn("[credential] Marked invalid", { companyId, platform, reason });
  },
};
