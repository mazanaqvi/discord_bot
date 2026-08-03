/**
 * Slash-command text often arrives as one line.
 * Support typed escapes: \n (newline), \t (tab).
 * Discord markdown (**bold**, *italic*, etc.) already works as-is.
 */
export function formatMessage(text) {
  return String(text)
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .trimEnd();
}
