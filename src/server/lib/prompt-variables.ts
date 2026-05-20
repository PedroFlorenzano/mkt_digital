/**
 * Replaces {{agentName}} and {{today}} (DD/MM/YYYY, America/Sao_Paulo)
 * in a system prompt string.
 */
export function substitutePromptVariables(
  prompt: string,
  agentName: string,
  now: Date = new Date(),
): string {
  const todayFormatted = now.toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  return prompt
    .replaceAll('{{agentName}}', agentName)
    .replaceAll('{{today}}', todayFormatted);
}
