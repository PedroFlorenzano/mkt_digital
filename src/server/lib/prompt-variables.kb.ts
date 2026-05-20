/**
 * Resolves template variables in a KBAgent systemPrompt.
 *
 * Variables:
 *   {{agentName}} → replaced by the KBAgent.name value
 *   {{today}}     → replaced by the current UTC date in YYYY-MM-DD format
 *
 * Guarantees: after substitution, no occurrence of {{agentName}} or {{today}} remains.
 * Uses global replace (replaceAll / regex with g flag).
 *
 * @param template  The systemPrompt string possibly containing variables
 * @param agentName The KBAgent.name value to substitute
 * @param today     The current UTC date in YYYY-MM-DD format
 */
export function resolveKBSystemPrompt(
  template: string,
  agentName: string,
  today: string,
): string {
  // Use replaceAll to handle multiple occurrences in one pass
  return template
    .replaceAll("{{agentName}}", agentName)
    .replaceAll("{{today}}", today);
}

/**
 * Returns today's date in YYYY-MM-DD format (UTC timezone).
 * Convenience helper for callers that don't already have the date string.
 */
export function getTodayUTC(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
