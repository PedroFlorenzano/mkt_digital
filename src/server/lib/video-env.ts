/**
 * video-env.ts
 * Validates required environment variables for the AI Video Generation module.
 * Called at module load time to fail fast with a descriptive error.
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `[video-env] Missing required environment variable: ${name}. ` +
      `Check .env.example for configuration instructions.`
    );
  }
  return value.trim();
}

export const videoEnv = {
  get s3VideoBucket(): string {
    return requireEnv("AWS_S3_VIDEO_BUCKET");
  },
  get pollyRegion(): string {
    return process.env["AWS_POLLY_REGION"] ?? "us-east-1";
  },
  get cronSecret(): string {
    return requireEnv("CRON_SECRET");
  },
};
