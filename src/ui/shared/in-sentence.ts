/**
 * Sentence-case words as they read after other words: "Query workers" in
 * "Change orders-db's query workers", "Remove orders-db" in "Undo remove
 * orders-db". A first word in capitals, such as "RDS", stays as it is.
 */
export function inSentence(text: string): string {
  if (/^.[A-Z]/u.test(text)) return text;
  return text.charAt(0).toLowerCase() + text.slice(1);
}
