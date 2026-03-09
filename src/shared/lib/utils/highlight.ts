/** Split a text string into parts, wrapping search matches */
export type TextPart = { text: string; highlight: boolean };

export const splitByQuery = (text: string, query: string): TextPart[] => {
  if (!query) return [{ text, highlight: false }];
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const parts: TextPart[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const idx = lowerText.indexOf(lowerQuery, cursor);
    if (idx === -1) {
      parts.push({ text: text.slice(cursor), highlight: false });
      break;
    }
    if (idx > cursor) {
      parts.push({ text: text.slice(cursor, idx), highlight: false });
    }
    parts.push({ text: text.slice(idx, idx + query.length), highlight: true });
    cursor = idx + query.length;
  }

  return parts;
};
