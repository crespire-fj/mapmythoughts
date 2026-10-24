import type { OutlineNode } from '../commands/commands';
import { ROOT_ID, childrenOf, type MapSnapshot } from '../model/schema';

/**
 * Markdown outline format: `# Title`, then a nested bullet list. Right-side branches come first,
 * then left-side ones. Multi-line node text continues on indented lines under its bullet; a note
 * follows as indented `>` lines.
 */
export function exportMarkdown(snapshot: MapSnapshot): string {
  const lines = [`# ${snapshot.title.replace(/\n+/g, ' ').trim() || 'Untitled map'}`, ''];
  const write = (ids: string[], depth: number) => {
    for (const id of ids) {
      const node = snapshot.nodes.get(id);
      if (!node) continue;
      const indent = '  '.repeat(depth);
      const [first = '', ...rest] = node.text.split('\n');
      const label = node.link ? `[${first || node.link}](${node.link})` : first;
      lines.push(`${indent}- ${label}`);
      for (const line of rest) lines.push(`${indent}  ${line}`);
      if (node.note)
        for (const line of node.note.split('\n')) lines.push(`${indent}  > ${line}`.trimEnd());
      write(snapshot.children.get(id) ?? [], depth + 1);
    }
  };
  write(
    [...childrenOf(snapshot, ROOT_ID, 'right'), ...childrenOf(snapshot, ROOT_ID, 'left')].map(
      (n) => n.id,
    ),
    0,
  );
  return lines.join('\n') + '\n';
}

const BULLET = /^(\s*)(?:[-*+]|\d+[.)])\s+(.*)$/;
const QUOTE = /^(\s*)>\s?(.*)$/;
const LINK = /^\[([^\]]*)\]\((\S+?)\)$/;

function indentWidth(whitespace: string): number {
  return whitespace.replace(/\t/g, '    ').length;
}

function makeNode(raw: string): OutlineNode {
  const text = raw.trim();
  const link = LINK.exec(text);
  return link ? { text: link[1] || link[2]!, link: link[2], children: [] } : { text, children: [] };
}

interface Parsed {
  title: string | null;
  roots: OutlineNode[];
}

function parse(markdown: string, takeTitle: boolean): Parsed {
  let title: string | null = null;
  const roots: OutlineNode[] = [];
  const stack: { indent: number; node: OutlineNode }[] = [];
  let last: { indent: number; node: OutlineNode } | null = null;

  const push = (indent: number, node: OutlineNode) => {
    while (stack.length && stack[stack.length - 1]!.indent >= indent) stack.pop();
    const parent = stack[stack.length - 1];
    (parent ? parent.node.children : roots).push(node);
    last = { indent, node };
    stack.push(last);
  };

  for (const raw of markdown.replace(/\r\n?/g, '\n').split('\n')) {
    if (!raw.trim()) continue;
    const lineIndent = indentWidth(/^\s*/.exec(raw)?.[0] ?? '');
    const bullet = BULLET.exec(raw);
    const quote = QUOTE.exec(raw);
    const heading = /^#{1,6}\s+(.*)$/.exec(raw.trim());
    const current = last as { indent: number; node: OutlineNode } | null;
    if (bullet) {
      push(indentWidth(bullet[1] ?? ''), makeNode(bullet[2] ?? ''));
    } else if (quote && current && lineIndent > current.indent) {
      const text = quote[2] ?? '';
      current.node.note = current.node.note ? `${current.node.note}\n${text}` : text;
    } else if (heading && takeTitle && title === null && roots.length === 0) {
      title = (heading[1] ?? '').trim();
    } else if (current && lineIndent > current.indent) {
      current.node.text += `\n${raw.trim()}`;
    } else if (takeTitle && title === null && roots.length === 0) {
      title = raw.trim();
    } else {
      push(lineIndent, makeNode(heading ? (heading[1] ?? '') : raw));
    }
  }
  return { title, roots };
}

/**
 * Parses a Markdown outline into a new map. The title is the first heading, or the first plain
 * line. If there is no title and the list has a single top-level item, that item becomes the root.
 */
export function parseMarkdown(markdown: string): { title: string; outline: OutlineNode[] } {
  const { title, roots } = parse(markdown, true);
  if (title === null && roots.length === 1) {
    return { title: roots[0]!.text, outline: roots[0]!.children };
  }
  return { title: title ?? 'Imported map', outline: roots };
}

/** Parses pasted text into branches: bullets keep their nesting, plain lines become nodes. */
export function parseFragment(text: string): OutlineNode[] {
  return parse(text, false).roots;
}
