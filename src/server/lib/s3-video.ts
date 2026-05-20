/**
 * s3-video.ts
 *
 * AWS S3 helper functions for the AI Video Generation module.
 * All video artefacts (raw upload, frames, narration, final output) are
 * stored in a dedicated bucket configured via AWS_S3_VIDEO_BUCKET.
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Readable } from "node:stream";
import { videoEnv } from "@server/lib/video-env";
import { ExternalServiceError } from "@server/lib/errors";
import { logger } from "@server/lib/logger";
import {
  isLocalKey,
  isDevMode,
  writeLocalArtifact,
  readLocalArtifact,
  deleteLocalArtifacts,
} from "@server/lib/local-storage";

// ---------------------------------------------------------------------------
// S3 client (reused across calls)
// ---------------------------------------------------------------------------

let _s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!_s3Client) {
    _s3Client = new S3Client({ region: process.env["AWS_BEDROCK_TEXT_REGION"] ?? "us-east-1" });
  }
  return _s3Client;
}

// ---------------------------------------------------------------------------
// Key helpers
// ---------------------------------------------------------------------------

/**
 * Returns the S3 key prefix for all artefacts of a given job.
 * Format: `videos/{jobId}/`
 */
export function buildJobS3Prefix(jobId: string): string {
  return `videos/${jobId}/`;
}

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

/**
 * Uploads a buffer or readable stream to S3.
 * Falls back to local disk storage in dev mode.
 * Throws ExternalServiceError on failure.
 */
export async function uploadVideoArtifact(
  s3Key: string,
  body: Buffer | Readable | Uint8Array,
  contentType: string,
): Promise<void> {
  // Dev mode: write to local disk
  if (isDevMode() || isLocalKey(s3Key)) {
    const localKey = isLocalKey(s3Key) ? s3Key : `local:${s3Key}`;
    const buf = body instanceof Buffer ? body : Buffer.from(body as Uint8Array);
    writeLocalArtifact(localKey, buf);
    logger.info("[s3-video] Saved locally (dev)", { localKey });
    return;
  }

  try {
    await getS3Client().send(
      new PutObjectCommand({
        Bucket: videoEnv.s3VideoBucket,
        Key: s3Key,
        Body: body,
        ContentType: contentType,
      }),
    );
    logger.info("[s3-video] Uploaded", { s3Key, contentType });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("[s3-video] Upload failed", err, { s3Key });
    throw new ExternalServiceError("AWS S3", `Upload failed for ${s3Key}: ${message}`);
  }
}

// ---------------------------------------------------------------------------
// Download
// ---------------------------------------------------------------------------

/**
 * Downloads an S3 object and returns its content as a Buffer.
 * Falls back to local disk in dev mode.
 * Throws ExternalServiceError on failure.
 */
export async function downloadVideoArtifact(s3Key: string): Promise<Buffer> {
  // Dev mode or local key: read from disk
  if (isDevMode() || isLocalKey(s3Key)) {
    const localKey = isLocalKey(s3Key) ? s3Key : `local:${s3Key}`;
    try {
      const buf = readLocalArtifact(localKey);
      logger.info("[s3-video] Read locally (dev)", { localKey });
      return buf;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new ExternalServiceError("Local Storage", `Read failed for ${localKey}: ${message}`);
    }
  }

  try {
    const response = await getS3Client().send(
      new GetObjectCommand({
        Bucket: videoEnv.s3VideoBucket,
        Key: s3Key,
      }),
    );

    const stream = response.Body as Readable;
    const chunks: Buffer[] = [];

    await new Promise<void>((resolve, reject) => {
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("end", resolve);
      stream.on("error", reject);
    });

    return Buffer.concat(chunks);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("[s3-video] Download failed", err, { s3Key });
    throw new ExternalServiceError("AWS S3", `Download failed for ${s3Key}: ${message}`);
  }
}

// ---------------------------------------------------------------------------
// Presigned URLs
// ---------------------------------------------------------------------------

/**
 * Generates a presigned PUT URL for direct browser upload.
 *
 * @param s3Key       Target S3 key
 * @param contentType MIME type of the file
 * @param expiresIn   URL validity in seconds (default 3600 = 1h)
 */
export async function generatePresignedUploadUrl(
  s3Key: string,
  contentType: string,
  expiresIn = 3600,
): Promise<string> {
  try {
    const command = new PutObjectCommand({
      Bucket: videoEnv.s3VideoBucket,
      Key: s3Key,
      ContentType: contentType,
    });
    return await getSignedUrl(getS3Client(), command, { expiresIn });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new ExternalServiceError("AWS S3", `Presigned upload URL failed: ${message}`);
  }
}

/**
 * Generates a presigned GET URL for secure download.
 *
 * @param s3Key     Target S3 key
 * @param expiresIn URL validity in seconds (default 86400 = 24h)
 */
export async function generatePresignedDownloadUrl(
  s3Key: string,
  expiresIn = 86400,
): Promise<string> {
  // Dev mode: return a local public URL
  if (isDevMode() || isLocalKey(s3Key)) {
    const localKey = isLocalKey(s3Key) ? s3Key : `local:${s3Key}`;
    const relativePath = localKey.replace("local:", "");
    return `/${relativePath}`;
  }

  try {
    const command = new GetObjectCommand({
      Bucket: videoEnv.s3VideoBucket,
      Key: s3Key,
    });
    return await getSignedUrl(getS3Client(), command, { expiresIn });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new ExternalServiceError("AWS S3", `Presigned download URL failed: ${message}`);
  }
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

/**
 * Deletes a list of S3 keys. Uses batch delete when possible.
 * In dev mode, deletes local files instead.
 * Silently ignores missing keys (not-found is not an error).
 */
export async function deleteVideoArtifacts(s3Keys: string[]): Promise<void> {
  if (s3Keys.length === 0) return;

  // Split local vs remote keys
  const localKeys = s3Keys.filter(isLocalKey);
  const remoteKeys = s3Keys.filter((k) => !isLocalKey(k));

  // Delete local
  if (localKeys.length > 0) {
    deleteLocalArtifacts(localKeys);
  }

  // In dev mode there are no real S3 keys to delete
  if (isDevMode() || remoteKeys.length === 0) return;

  try {
    // Batch delete up to 1000 keys at a time
    const batches: string[][] = [];
    for (let i = 0; i < remoteKeys.length; i += 1000) {
      batches.push(remoteKeys.slice(i, i + 1000));
    }

    for (const batch of batches) {
      await getS3Client().send(
        new DeleteObjectsCommand({
          Bucket: videoEnv.s3VideoBucket,
          Delete: {
            Objects: batch.map((Key) => ({ Key })),
            Quiet: true,
          },
        }),
      );
    }

    logger.info("[s3-video] Deleted artefacts", { count: remoteKeys.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("[s3-video] Delete failed", err, { count: remoteKeys.length });
    throw new ExternalServiceError("AWS S3", `Delete failed: ${message}`);
  }
}

/**
 * Deletes a single S3 key.
 */
export async function deleteVideoArtifact(s3Key: string): Promise<void> {
  try {
    await getS3Client().send(
      new DeleteObjectCommand({
        Bucket: videoEnv.s3VideoBucket,
        Key: s3Key,
      }),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("[s3-video] Single delete failed", err, { s3Key });
    throw new ExternalServiceError("AWS S3", `Delete failed for ${s3Key}: ${message}`);
  }
}
