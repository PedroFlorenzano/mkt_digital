/**
 * Splits an AI response into parts delimited by the backslash character.
 * Empty parts (consecutive backslashes or leading/trailing) are filtered out.
 * If no backslash is present, returns [text] as a single-element array.
 */
export function splitMessage(text: string): string[] {
  if (!text.includes('\\')) {
    return [text];
  }

  return text.split('\\').filter((part) => part.length > 0);
}
