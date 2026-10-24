import type * as Y from 'yjs';

/**
 * Replaces a Y.Text's content with `next` by editing only the changed middle section, so
 * concurrent edits elsewhere in the text merge instead of being overwritten.
 */
export function applyTextDiff(text: Y.Text, next: string): void {
  const current = text.toString();
  if (current === next) return;
  let start = 0;
  const maxStart = Math.min(current.length, next.length);
  while (start < maxStart && current[start] === next[start]) start++;
  let endCurrent = current.length;
  let endNext = next.length;
  while (endCurrent > start && endNext > start && current[endCurrent - 1] === next[endNext - 1]) {
    endCurrent--;
    endNext--;
  }
  if (endCurrent > start) text.delete(start, endCurrent - start);
  if (endNext > start) text.insert(start, next.slice(start, endNext));
}
