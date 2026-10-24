import {
  ROOT_ID,
  childrenOf,
  descendantsOf,
  type MapSnapshot,
  type NodeSnapshot,
} from '../model/schema';

/**
 * The map as seen in focus mode: `focusId` takes the place of the root, its subtree is the whole
 * map, and its children are spread over both sides like main branches. Everything else is
 * hidden. Ids are unchanged except that the focused node appears as ROOT_ID.
 */
export function focusSnapshot(full: MapSnapshot, focusId: string): MapSnapshot {
  const focus = full.nodes.get(focusId);
  if (!focus) return full;
  const inside = new Set(descendantsOf(full, focusId));
  const firstLevel = childrenOf(full, focusId).map((n) => n.id);
  const nodes = new Map<string, NodeSnapshot>();
  firstLevel.forEach((id, i) => {
    nodes.set(id, { ...full.nodes.get(id)!, parentId: null, side: i % 2 === 0 ? 'right' : 'left' });
  });
  for (const id of inside) if (!nodes.has(id)) nodes.set(id, full.nodes.get(id)!);

  const children = new Map<string, string[]>([[ROOT_ID, firstLevel]]);
  for (const id of inside) {
    const kids = full.children.get(id);
    if (kids) children.set(id, kids);
  }
  const toView = (id: string) => (id === focusId ? ROOT_ID : id);
  const visible = (id: string) => id === focusId || inside.has(id);
  return {
    title: focus.text,
    settings: full.settings,
    links: full.links
      .filter((l) => visible(l.from) && visible(l.to))
      .map((l) => ({ ...l, from: toView(l.from), to: toView(l.to) })),
    nodes,
    children,
  };
}
