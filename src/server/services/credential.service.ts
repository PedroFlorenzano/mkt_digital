/**
 * Credential service — stores, retrieves and manages ad platform credentials.
 *
 * Credentials are encrypted at rest using AES-256-GCM (via credential-crypto lib).
 * Decrypted values are NEVER logged.
 */

import {
  encryptCredential,
  decryptCredential,
  serializeBlob,
  deserializeBlob,
} from "@server/lib/credential-crypto";
import { NotFoundError } from "@server/lib/errors";
import { logger } from "@server/lib/logger";
import { credentialRepository } from "@server/repositories/credential.repository";
import type { AdPlatformCredential } from "@prisma/client";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type AdPlatform = "meta" | "google";

export interface RawCredentialData {
  appId?: string;
  appSecret?: string;
  accessToken?: string;
  adAccountId?: string;
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
  async save(
    companyId: string,
    platform: AdPlatform,
    data: RawCredentialData,
  ): Promise<AdPlatformCredential> {
    const plaintext = JSON.stringify(data);
    const blob = encryptCredential(plaintext);
    const encryptedToken = serializeBlob(blob);

    const record = await credentialRepository.upsert(companyId, platform, { encryptedData: encryptedToken });
    logger.info("[credential] Saved", { companyId, platform });
    return record;
  },

  async get(
    companyId: string,
    platform: AdPlatform,
  ): Promise<DecryptedCredential> {
    const record = await credentialRepository.findByCompanyAndPlatform(companyId, platform);
    if (!record) {
      throw new NotFoundError(`Credencial ${platform} não encontrada.`);
    }

    const blob = deserializeBlob(record.encryptedData);
    const plaintext = decryptCredential(blob);
    const fields = JSON.parse(plaintext) as Record<string, string>;
    return { platform, fields };
  },

  async delete(companyId: string, platform: AdPlatform): Promise<void> {
    const record = await credentialRepository.findByCompanyAndPlatform(companyId, platform);
    if (!record) {
      throw new NotFoundError(`Credencial ${platform} não encontrada.`);
    }
    await credentialRepository.delete(companyId, platform);
    logger.info("[credential] Deleted", { companyId, platform });
  },

  async markValid(
    companyId: string,
    platform: AdPlatform,
  ): Promise<AdPlatformCredential> {
    const record = await credentialRepository.markValid(companyId, platform);
    logger.info("[credential] Marked valid", { companyId, platform });
    return record;
  },

  async markInvalid(
    companyId: string,
    platform: AdPlatform,
    reason: string,
  ): Promise<void> {
    await credentialRepository.markInvalid(companyId, platform);
    logger.warn("[credential] Marked invalid", { companyId, platform, reason });
  },
};
