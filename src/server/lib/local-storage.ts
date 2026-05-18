/**
 * local-storage.ts
 *
 * Dev fallback: stores video pipeline artefacts on local disk when S3 is
 * not configured. Seamlessly integrates with the same key scheme used by
 * s3-video.ts so all pipeline stages work without an AWS account.
 *
 * Local keys format: "local:{relativePath}"
 * e.g. "local:uploads/jobs/{jobId}/brief.json"
 * Files stored at: {cwd}/public/{relativePath}
 */

import * as path from "node:path";
import * as fs from "node:fs";

export const LOCAL_KEY_PREFIX = "local:";

export function isLocalKey(key: string): boolean {
  return key.startsWith(LOCAL_KEY_PREFIX);
}

export function localKeyToPath(key: string): string {
  const relativePath = key.replace(LOCAL_KEY_PREFIX, "");
  return path.join(process.cwd(), "public", relativePath);
}

export function writeLocalArtifact(key: string, data: Buffer): void {
  const filePath = localKeyToPath(key);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, data);
}

export function readLocalArtifact(key: string): Buffer {
  const filePath = localKeyToPath(key);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Local artifact not found: ${filePath}`);
  }
  return fs.readFileSync(filePath);
}

export function deleteLocalArtifacts(keys: string[]): void {
  for (const key of keys) {
    if (!isLocalKey(key)) continue;
    try {
      const filePath = localKeyToPath(key);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch { /* non-fatal */ }
  }
}

export function buildLocalJobKey(jobId: string, subPath: string): string {
  return `${LOCAL_KEY_PREFIX}uploads/jobs/${jobId}/${subPath}`;
}

/** True when AWS S3 is not configured (bucket is placeholder) */
export function isDevMode(): boolean {
  const bucket = process.env["AWS_S3_VIDEO_BUCKET"] ?? "";
  return !bucket || bucket === "mkt-digital-videos-dev" || bucket === "your-s3-bucket-name";
}
