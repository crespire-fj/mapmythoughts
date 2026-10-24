import { treeOrder, type MapSnapshot } from '../model/schema';

/** Lower-case and strip accents, so "eleve" finds "élève". */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/** Nodes whose text or note contains every word of the query, in reading order. */
export function findMatches(snapshot: MapSnapshot, query: string): string[] {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return treeOrder(snapshot).filter((id) => {
    const node = snapshot.nodes.get(id)!;
    const haystack = normalize(`${node.text}\n${node.note}`);
    return words.every((word) => haystack.includes(word));
  });
}
