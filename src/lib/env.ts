/**
 * Environment variable validation.
 * Throws at startup if any required variable is missing.
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `[env] Missing required environment variable: ${name}\n` +
      `Please check your .env file and ensure all required variables are set.`
    );
  }
  return value;
}

function optionalEnv(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

export const env = {
  // Database
  DATABASE_URL: requireEnv("DATABASE_URL"),

  // Auth
  NEXTAUTH_SECRET: requireEnv("NEXTAUTH_SECRET"),
  NEXTAUTH_URL: requireEnv("NEXTAUTH_URL"),

  // Google OAuth (optional in dev)
  GOOGLE_CLIENT_ID: optionalEnv("GOOGLE_CLIENT_ID"),
  GOOGLE_CLIENT_SECRET: optionalEnv("GOOGLE_CLIENT_SECRET"),

  // AWS
  AWS_PROFILE: optionalEnv("AWS_PROFILE", "mktai"),
  AWS_BEDROCK_TEXT_REGION: optionalEnv("AWS_BEDROCK_TEXT_REGION", "us-east-1"),
  AWS_BEDROCK_IMAGE_REGION: optionalEnv("AWS_BEDROCK_IMAGE_REGION", "us-west-2"),

  // Cron
  CRON_SECRET: requireEnv("CRON_SECRET"),

  // App
  NODE_ENV: optionalEnv("NODE_ENV", "development"),
  APP_URL: optionalEnv("NEXTAUTH_URL", "http://localhost:3030"),
} as const;

export type Env = typeof env;
