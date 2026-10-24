import type { OutlineNode } from '../commands/commands';
import { parseFragment } from '../export/markdown';

/**
 * The system clipboard carries a plain Markdown outline, so branches paste into any app. The
 * full detail (notes, styles, markers, collapsed state) is kept in memory alongside it and used
 * when the same text comes back from the clipboard.
 */
let lastCopy: { text: string; nodes: OutlineNode[] } | null = null;

export function outlineToText(nodes: OutlineNode[]): string {
  const lines: string[] = [];
  const write = (items: OutlineNode[], depth: number) => {
    for (const item of items) {
      const indent = '  '.repeat(depth);
      const [first = '', ...rest] = item.text.split('\n');
      lines.push(`${indent}- ${first}`);
      for (const line of rest) lines.push(`${indent}  ${line}`);
      if (item.note)
        for (const line of item.note.split('\n')) lines.push(`${indent}  > ${line}`.trimEnd());
      write(item.children, depth + 1);
    }
  };
  write(nodes, 0);
  return lines.join('\n');
}

export function rememberCopy(nodes: OutlineNode[]): string {
  const text = outlineToText(nodes);
  lastCopy = { text, nodes };
  return text;
}

/** Branches to paste for clipboard text: the remembered copy if it matches, else parsed text. */
export function nodesFromClipboard(text: string): OutlineNode[] {
  if (lastCopy && lastCopy.text === text) return structuredClone(lastCopy.nodes);
  return parseFragment(text);
}
