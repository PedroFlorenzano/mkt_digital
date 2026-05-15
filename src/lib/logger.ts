/**
 * Structured JSON logger.
 * Replaces all console.log/warn/error calls in the application.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  requestId?: string;
  userId?: string;
  [key: string]: unknown;
}

const REDACTED_KEYS = ["secret", "password", "token", "key", "authorization", "cookie"];

function redact(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    const lower = k.toLowerCase();
    if (REDACTED_KEYS.some((r) => lower.includes(r))) {
      result[k] = "[REDACTED]";
    } else if (v && typeof v === "object" && !Array.isArray(v)) {
      result[k] = redact(v as Record<string, unknown>);
    } else {
      result[k] = v;
    }
  }
  return result;
}

function formatError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  return { message: String(err) };
}

function log(
  level: LogLevel,
  message: string,
  meta: Record<string, unknown> = {},
): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...redact(meta),
  };

  const output = JSON.stringify(entry);

  if (level === "error") {
    process.stderr.write(output + "\n");
  } else {
    process.stdout.write(output + "\n");
  }
}

export const logger = {
  debug: (message: string, meta?: Record<string, unknown>) =>
    log("debug", message, meta),

  info: (message: string, meta?: Record<string, unknown>) =>
    log("info", message, meta),

  warn: (message: string, meta?: Record<string, unknown>) =>
    log("warn", message, meta),

  error: (message: string, err?: unknown, meta?: Record<string, unknown>) =>
    log("error", message, {
      ...(err ? { error: formatError(err) } : {}),
      ...meta,
    }),
};
