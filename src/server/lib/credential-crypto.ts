/**
 * Credential encryption library using AES-256-GCM via Node.js native crypto.
 *
 * Key: 32 bytes derived from CREDENTIAL_ENCRYPTION_KEY env var (hex string, 64 chars).
 * Throws ConfigurationError at module load time if the env var is missing or invalid.
 *
 * IVs: each encryptCredential call generates a new random 16-byte IV — never reused.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export interface EncryptedBlob {
  iv: string;   // hex — 16 random bytes per operation (never reused)
  tag: string;  // hex — GCM authentication tag (16 bytes)
  data: string; // hex — ciphertext
}

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;   // bytes
const TAG_LENGTH = 16;  // bytes

// ---------------------------------------------------------------------------
// Module-load-time key validation
// ---------------------------------------------------------------------------

function loadEncryptionKey(): Buffer {
  const envValue = process.env.CREDENTIAL_ENCRYPTION_KEY;

  if (!envValue || envValue.trim() === "") {
    throw new Error(
      "[credential-crypto] ConfigurationError: CREDENTIAL_ENCRYPTION_KEY environment variable is missing. " +
      "Set it to a 64-character hex string (32 bytes) in your .env file."
    );
  }

  if (!/^[0-9a-fA-F]{64}$/.test(envValue)) {
    throw new Error(
      "[credential-crypto] ConfigurationError: CREDENTIAL_ENCRYPTION_KEY must be exactly 64 hexadecimal " +
      `characters (representing 32 bytes). Received ${envValue.length} character(s).`
    );
  }

  return Buffer.from(envValue, "hex");
}

const ENCRYPTION_KEY: Buffer = loadEncryptionKey();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * A new random 16-byte IV is generated for every call — IVs are never reused.
 */
export function encryptCredential(plaintext: string): EncryptedBlob {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv, {
    authTagLength: TAG_LENGTH,
  });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  const tag = cipher.getAuthTag();

  return {
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
    data: encrypted.toString("hex"),
  };
}

/**
 * Decrypts an EncryptedBlob back to the original plaintext string.
 * Throws if the blob has been tampered with (authentication tag mismatch).
 */
export function decryptCredential(blob: EncryptedBlob): string {
  const iv = Buffer.from(blob.iv, "hex");
  const tag = Buffer.from(blob.tag, "hex");
  const ciphertext = Buffer.from(blob.data, "hex");

  const decipher = createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv, {
    authTagLength: TAG_LENGTH,
  });
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

/**
 * Serializes an EncryptedBlob to a JSON string for storage.
 */
export function serializeBlob(blob: EncryptedBlob): string {
  return JSON.stringify(blob);
}

/**
 * Deserializes a JSON string back to an EncryptedBlob.
 * Validates that all required fields (iv, tag, data) are present.
 * Throws if the JSON is malformed or any field is missing.
 */
export function deserializeBlob(json: string): EncryptedBlob {
  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error(
      "[credential-crypto] deserializeBlob: invalid JSON — could not parse the provided string."
    );
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(
      "[credential-crypto] deserializeBlob: expected a JSON object but received a different type."
    );
  }

  const obj = parsed as Record<string, unknown>;
  const missingFields: string[] = [];

  if (typeof obj.iv !== "string" || obj.iv === "") missingFields.push("iv");
  if (typeof obj.tag !== "string" || obj.tag === "") missingFields.push("tag");
  if (typeof obj.data !== "string" || obj.data === "") missingFields.push("data");

  if (missingFields.length > 0) {
    throw new Error(
      `[credential-crypto] deserializeBlob: missing or empty required field(s): ${missingFields.join(", ")}.`
    );
  }

  return {
    iv: obj.iv as string,
    tag: obj.tag as string,
    data: obj.data as string,
  };
}
