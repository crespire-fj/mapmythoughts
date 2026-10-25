import * as Y from 'yjs';

/**
 * One Y.Doc per map. The root node is implicit: its text is the map title. Every other node is a
 * Y.Map in the `nodes` map. Positions are never stored; the layout engine computes them.
 */
export const ROOT_ID = 'root';
export const TITLE_KEY = 'title'; // must match server/src/index.ts
const NODES_KEY = 'nodes'; // must match server/src/index.ts
const SETTINGS_KEY = 'settings';
const LINKS_KEY = 'links';

export type Side = 'left' | 'right';
export type Shape = 'rounded' | 'pill' | 'rect' | 'underline';
export type Orientation = 'horizontal' | 'vertical';
export type ConnectorStyle = 'curved' | 'elbow';
export type ThemeId =
  'daydream' | 'spark' | 'lagoon' | 'spc' | 'reef' | 'sunset' | 'forest' | 'mono';

export const SHAPES: readonly Shape[] = ['rounded', 'pill', 'rect', 'underline'];
/** 'auto' means the colour comes from the map's theme and the node's branch. */
export const AUTO_COLOR = 'auto';
export const COLORS: readonly string[] = [
  AUTO_COLOR,
  '#ffffff',
  '#fff1b8',
  '#d3f9d8',
  '#c5f6fa',
  '#d0ebff',
  '#e5dbff',
  '#ffdeeb',
  '#ffe3e3',
  '#ffe8cc',
  '#e9ecef',
];
export const DEFAULT_STYLE = { shape: 'rounded' as Shape, color: AUTO_COLOR };

export const MARKERS = [
  'done',
  'progress',
  'todo',
  'important',
  'question',
  'idea',
  'star',
] as const;
export type Marker = (typeof MARKERS)[number];

export interface MapSettings {
  orientation: Orientation;
  connector: ConnectorStyle;
  theme: ThemeId;
}
export const DEFAULT_SETTINGS: MapSettings = {
  orientation: 'horizontal',
  connector: 'curved',
  theme: 'lagoon',
};
const ORIENTATIONS: readonly Orientation[] = ['horizontal', 'vertical'];
const CONNECTORS: readonly ConnectorStyle[] = ['curved', 'elbow'];
// Existing maps keep their theme; DEFAULT_SETTINGS stays 'lagoon' so maps saved without one don't change.
export const THEME_IDS: readonly ThemeId[] = [
  'daydream',
  'spark',
  'lagoon',
  'spc',
  'reef',
  'sunset',
  'forest',
  'mono',
];

export interface NodeSnapshot {
  id: string;
  /** null for first-level nodes, which hang off the root */
  parentId: string | null;
  order: string;
  /** only meaningful for first-level nodes; deeper nodes inherit their branch's side */
  side: Side;
  collapsed: boolean;
  shape: Shape;
  color: string;
  text: string;
  note: string;
  link: string;
  marker: Marker | null;
  /** lay this node's branch out as steps flowing down (or across, in a top-and-bottom map) */
  steps: boolean;
}

/** A cross-link: a labelled line between any two nodes, outside the tree. */
export interface LinkSnapshot {
  id: string;
  from: string;
  to: string;
  label: string;
}

export interface MapSnapshot {
  title: string;
  settings: MapSettings;
  /** cross-links whose endpoints both exist (the root counts as ROOT_ID) */
  links: LinkSnapshot[];
  nodes: Map<string, NodeSnapshot>;
  /** children by parent id (ROOT_ID for first-level nodes of both sides), sorted by order */
  children: Map<string, string[]>;
}

export function getNodes(doc: Y.Doc): Y.Map<Y.Map<unknown>> {
  return doc.getMap<Y.Map<unknown>>(NODES_KEY);
}

export function getTitle(doc: Y.Doc): Y.Text {
  return doc.getText(TITLE_KEY);
}

export function getSettings(doc: Y.Doc): Y.Map<unknown> {
  return doc.getMap<unknown>(SETTINGS_KEY);
}

export function getLinks(doc: Y.Doc): Y.Map<Y.Map<unknown>> {
  return doc.getMap<Y.Map<unknown>>(LINKS_KEY);
}

export function getNodeText(doc: Y.Doc, id: string): Y.Text | undefined {
  if (id === ROOT_ID) return getTitle(doc);
  const text = getNodes(doc).get(id)?.get('text');
  return text instanceof Y.Text ? text : undefined;
}

export function readSettings(doc: Y.Doc): MapSettings {
  const map = getSettings(doc);
  const orientation = map.get('orientation') as Orientation;
  const connector = map.get('connector') as ConnectorStyle;
  const theme = map.get('theme') as ThemeId;
  return {
    orientation: ORIENTATIONS.includes(orientation) ? orientation : DEFAULT_SETTINGS.orientation,
    connector: CONNECTORS.includes(connector) ? connector : DEFAULT_SETTINGS.connector,
    theme: THEME_IDS.includes(theme) ? theme : DEFAULT_SETTINGS.theme,
  };
}

export function compareOrder(a: NodeSnapshot, b: NodeSnapshot): number {
  if (a.order < b.order) return -1;
  if (a.order > b.order) return 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function readNode(id: string, map: Y.Map<unknown>): NodeSnapshot {
  const text = map.get('text');
  const note = map.get('note');
  const shape = map.get('shape') as Shape;
  const marker = map.get('marker') as Marker;
  return {
    id,
    parentId: (map.get('parentId') as string | null | undefined) ?? null,
    order: (map.get('order') as string | undefined) ?? 'a0',
    side: map.get('side') === 'left' ? 'left' : 'right',
    collapsed: map.get('collapsed') === true,
    shape: SHAPES.includes(shape) ? shape : DEFAULT_STYLE.shape,
    color: (map.get('color') as string | undefined) ?? DEFAULT_STYLE.color,
    text: text instanceof Y.Text ? text.toString() : '',
    note: note instanceof Y.Text ? note.toString() : '',
    link: (map.get('link') as string | undefined) ?? '',
    marker: MARKERS.includes(marker) ? marker : null,
    steps: map.get('steps') === true,
  };
}

export function readSnapshot(doc: Y.Doc): MapSnapshot {
  const nodes = new Map<string, NodeSnapshot>();
  getNodes(doc).forEach((map, id) => nodes.set(id, readNode(id, map)));

  const children = new Map<string, string[]>();
  const grouped = new Map<string, NodeSnapshot[]>();
  for (const node of nodes.values()) {
    // A node whose parent no longer exists is shown as a first-level node rather than lost.
    const parentKey = node.parentId && nodes.has(node.parentId) ? node.parentId : ROOT_ID;
    const list = grouped.get(parentKey) ?? [];
    list.push(node);
    grouped.set(parentKey, list);
  }
  for (const [key, list] of grouped) {
    children.set(
      key,
      list.sort(compareOrder).map((n) => n.id),
    );
  }
  const links: LinkSnapshot[] = [];
  const exists = (id: unknown): id is string =>
    typeof id === 'string' && (id === ROOT_ID || nodes.has(id));
  getLinks(doc).forEach((map, id) => {
    const from = map.get('from');
    const to = map.get('to');
    if (exists(from) && exists(to) && from !== to) {
      links.push({ id, from, to, label: (map.get('label') as string | undefined) ?? '' });
    }
  });
  links.sort((a, b) => (a.id < b.id ? -1 : 1));
  return { title: getTitle(doc).toString(), settings: readSettings(doc), links, nodes, children };
}

export function childrenOf(snapshot: MapSnapshot, parentId: string, side?: Side): NodeSnapshot[] {
  const ids = snapshot.children.get(parentId) ?? [];
  const list = ids.map((id) => snapshot.nodes.get(id)).filter((n): n is NodeSnapshot => !!n);
  if (parentId === ROOT_ID && side) return list.filter((n) => n.side === side);
  return list;
}

/** The parent key used in `children`: ROOT_ID for first-level and orphaned nodes. */
export function parentKeyOf(snapshot: MapSnapshot, id: string): string {
  const node = snapshot.nodes.get(id);
  if (!node || !node.parentId || !snapshot.nodes.has(node.parentId)) return ROOT_ID;
  return node.parentId;
}

/** The first-level node a node belongs to (itself, if it is first-level). */
export function branchRootOf(snapshot: MapSnapshot, id: string): string | null {
  let current = id;
  const seen = new Set<string>();
  while (snapshot.nodes.has(current) && !seen.has(current)) {
    seen.add(current);
    const parentKey = parentKeyOf(snapshot, current);
    if (parentKey === ROOT_ID) return current;
    current = parentKey;
  }
  return null;
}

/** Side of the branch a node belongs to, walking up to its first-level ancestor. */
export function branchSide(snapshot: MapSnapshot, id: string): Side {
  const root = branchRootOf(snapshot, id);
  return (root && snapshot.nodes.get(root)?.side) || 'right';
}

/** Siblings in the same list as the node (same parent, and same side for first-level nodes). */
export function siblingsOf(snapshot: MapSnapshot, id: string): NodeSnapshot[] {
  const parentKey = parentKeyOf(snapshot, id);
  const node = snapshot.nodes.get(id);
  return childrenOf(snapshot, parentKey, parentKey === ROOT_ID ? node?.side : undefined);
}

export function descendantsOf(snapshot: MapSnapshot, id: string): string[] {
  const result: string[] = [];
  const stack = [...(snapshot.children.get(id) ?? [])];
  const seen = new Set<string>([id]);
  while (stack.length) {
    const next = stack.pop()!;
    if (seen.has(next)) continue;
    seen.add(next);
    result.push(next);
    stack.push(...(snapshot.children.get(next) ?? []));
  }
  return result;
}

export function ancestorsOf(snapshot: MapSnapshot, id: string): string[] {
  const result: string[] = [];
  let key = parentKeyOf(snapshot, id);
  const seen = new Set<string>();
  while (key !== ROOT_ID && !seen.has(key)) {
    seen.add(key);
    result.push(key);
    key = parentKeyOf(snapshot, key);
  }
  return result;
}

export function depthOf(snapshot: MapSnapshot, id: string): number {
  return id === ROOT_ID ? 0 : ancestorsOf(snapshot, id).length + 1;
}

/** Removes ids whose ancestor is also in the list, so subtree operations don't double up. */
export function topMost(snapshot: MapSnapshot, ids: Iterable<string>): string[] {
  const set = new Set(ids);
  set.delete(ROOT_ID);
  return [...set].filter((id) => !ancestorsOf(snapshot, id).some((a) => set.has(a)));
}

/** Depth-first order of all nodes, right side first: the order used by outline, search, exports. */
export function treeOrder(snapshot: MapSnapshot): string[] {
  const result: string[] = [];
  const visit = (ids: string[]) => {
    for (const id of ids) {
      result.push(id);
      visit(snapshot.children.get(id) ?? []);
    }
  };
  visit([
    ...childrenOf(snapshot, ROOT_ID, 'right').map((n) => n.id),
    ...childrenOf(snapshot, ROOT_ID, 'left').map((n) => n.id),
  ]);
  return result;
}
