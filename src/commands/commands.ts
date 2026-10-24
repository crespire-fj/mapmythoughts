import * as Y from 'yjs';
import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing';
import {
  DEFAULT_STYLE,
  ROOT_ID,
  ancestorsOf,
  branchSide,
  childrenOf,
  depthOf,
  descendantsOf,
  getLinks,
  getNodeText,
  getNodes,
  getSettings,
  getTitle,
  parentKeyOf,
  readSnapshot,
  siblingsOf,
  topMost,
  treeOrder,
  type MapSettings,
  type MapSnapshot,
  type Marker,
  type Shape,
  type Side,
} from '../model/schema';
import { applyTextDiff } from './textDiff';

/**
 * Commands are the only code that writes to the document. Each runs in one transaction tagged
 * with LOCAL_ORIGIN, which is what the undo manager tracks, so every command is one undo step.
 */
export const LOCAL_ORIGIN = { name: 'eqapmap-local' };

export interface MoveTarget {
  /** ROOT_ID to make the node first-level */
  parentId: string;
  /** required when parentId is ROOT_ID */
  side?: Side;
  /** position among the target's children (excluding the moved node) */
  index: number;
}

/** A detached subtree: what the clipboard, templates and imports carry. */
export interface OutlineNode {
  text: string;
  children: OutlineNode[];
  note?: string;
  link?: string;
  marker?: Marker | null;
  shape?: Shape;
  color?: string;
  collapsed?: boolean;
}

function keyBetween(a: string | null, b: string | null): string {
  if (a !== null && b !== null && a >= b) return generateKeyBetween(a, null);
  return generateKeyBetween(a, b);
}

function transact<T>(doc: Y.Doc, fn: () => T): T {
  let result!: T;
  doc.transact(() => {
    result = fn();
  }, LOCAL_ORIGIN);
  return result;
}

interface NodeFields {
  parentId: string | null;
  order: string;
  side: Side;
  shape: Shape;
  color: string;
  text?: string;
  note?: string;
  link?: string;
  marker?: Marker | null;
  collapsed?: boolean;
}

function insertNode(doc: Y.Doc, fields: NodeFields): string {
  const id = crypto.randomUUID();
  const map = new Y.Map<unknown>();
  map.set('parentId', fields.parentId);
  map.set('order', fields.order);
  map.set('side', fields.side);
  map.set('collapsed', fields.collapsed ?? false);
  map.set('shape', fields.shape);
  map.set('color', fields.color);
  map.set('text', new Y.Text(fields.text ?? ''));
  if (fields.note) map.set('note', new Y.Text(fields.note));
  if (fields.link) map.set('link', fields.link);
  if (fields.marker) map.set('marker', fields.marker);
  getNodes(doc).set(id, map);
  return id;
}

function styleFrom(snapshot: MapSnapshot, id: string): { shape: Shape; color: string } {
  const node = snapshot.nodes.get(id);
  return node ? { shape: node.shape, color: node.color } : { ...DEFAULT_STYLE };
}

/** The root side with fewer first-level nodes, so new branches keep the map balanced. */
export function balancedSide(snapshot: MapSnapshot): Side {
  const right = childrenOf(snapshot, ROOT_ID, 'right').length;
  const left = childrenOf(snapshot, ROOT_ID, 'left').length;
  return right <= left ? 'right' : 'left';
}

/** Order keys for inserting `count` nodes at `index` in a sibling list. */
function keysAt(siblings: { order: string }[], index: number, count: number): string[] {
  const at = Math.max(0, Math.min(index, siblings.length));
  const before = siblings[at - 1]?.order ?? null;
  const after = siblings[at]?.order ?? null;
  if (before !== null && after !== null && before >= after) {
    return generateNKeysBetween(before, null, count);
  }
  return generateNKeysBetween(before, after, count);
}

// ----- adding --------------------------------------------------------------------------------

/** Adds a child at the end of `parentId`'s children and returns the new node's id. */
export function addChild(doc: Y.Doc, parentId: string, options: { side?: Side } = {}): string {
  return transact(doc, () => {
    const snapshot = readSnapshot(doc);
    if (parentId === ROOT_ID) {
      const side = options.side ?? balancedSide(snapshot);
      const last = childrenOf(snapshot, ROOT_ID, side).at(-1);
      return insertNode(doc, {
        parentId: null,
        order: keyBetween(last?.order ?? null, null),
        side,
        ...DEFAULT_STYLE,
      });
    }
    const parent = snapshot.nodes.get(parentId);
    if (!parent) throw new Error(`No node ${parentId}`);
    if (parent.collapsed) getNodes(doc).get(parentId)?.set('collapsed', false);
    const last = childrenOf(snapshot, parentId).at(-1);
    return insertNode(doc, {
      parentId,
      order: keyBetween(last?.order ?? null, null),
      side: branchSide(snapshot, parentId),
      ...styleFrom(snapshot, parentId),
    });
  });
}

/** Adds a sibling directly after `nodeId` and returns its id. */
export function addSibling(doc: Y.Doc, nodeId: string): string {
  if (nodeId === ROOT_ID) return addChild(doc, ROOT_ID);
  return transact(doc, () => {
    const snapshot = readSnapshot(doc);
    const node = snapshot.nodes.get(nodeId);
    if (!node) throw new Error(`No node ${nodeId}`);
    const siblings = siblingsOf(snapshot, nodeId);
    const next = siblings
      .slice(siblings.findIndex((s) => s.id === nodeId) + 1)
      .find((s) => s.order > node.order);
    const parentKey = parentKeyOf(snapshot, nodeId);
    return insertNode(doc, {
      parentId: parentKey === ROOT_ID ? null : parentKey,
      order: keyBetween(node.order, next?.order ?? null),
      side: parentKey === ROOT_ID ? node.side : branchSide(snapshot, nodeId),
      ...styleFrom(snapshot, nodeId),
    });
  });
}

function writeTree(
  doc: Y.Doc,
  items: OutlineNode[],
  parentId: string | null,
  keys: string[],
  sides: Side[],
): string[] {
  return items.map((item, i) => {
    const id = insertNode(doc, {
      parentId,
      order: keys[i]!,
      side: sides[i]!,
      shape: item.shape ?? DEFAULT_STYLE.shape,
      color: item.color ?? DEFAULT_STYLE.color,
      text: item.text,
      note: item.note,
      link: item.link,
      marker: item.marker ?? null,
      collapsed: item.collapsed && item.children.length > 0,
    });
    writeTree(
      doc,
      item.children,
      id,
      generateNKeysBetween(null, null, item.children.length),
      item.children.map(() => sides[i]!),
    );
    return id;
  });
}

/**
 * Inserts subtrees under `parentId` (appended, or at `index`). Under the root, branches go to
 * `side`, or alternate to keep the map balanced. Returns the ids of the inserted top nodes.
 */
export function insertSubtrees(
  doc: Y.Doc,
  parentId: string,
  items: OutlineNode[],
  options: { side?: Side; index?: number } = {},
): string[] {
  if (items.length === 0) return [];
  return transact(doc, () => {
    const snapshot = readSnapshot(doc);
    if (parentId === ROOT_ID) {
      let right = childrenOf(snapshot, ROOT_ID, 'right').length;
      let left = childrenOf(snapshot, ROOT_ID, 'left').length;
      const bySide: Record<Side, OutlineNode[]> = { right: [], left: [] };
      for (const item of items) {
        const side = options.side ?? (right <= left ? 'right' : 'left');
        if (side === 'right') right++;
        else left++;
        bySide[side].push(item);
      }
      const written = new Map<OutlineNode, string>();
      for (const side of ['right', 'left'] as const) {
        const list = bySide[side];
        if (!list.length) continue;
        const siblings = childrenOf(snapshot, ROOT_ID, side);
        const keys = keysAt(siblings, options.index ?? siblings.length, list.length);
        const newIds = writeTree(
          doc,
          list,
          null,
          keys,
          list.map(() => side),
        );
        list.forEach((item, i) => written.set(item, newIds[i]!));
      }
      return items.map((item) => written.get(item)!);
    }
    if (!snapshot.nodes.has(parentId)) throw new Error(`No node ${parentId}`);
    if (snapshot.nodes.get(parentId)!.collapsed)
      getNodes(doc).get(parentId)?.set('collapsed', false);
    const siblings = childrenOf(snapshot, parentId);
    const keys = keysAt(siblings, options.index ?? siblings.length, items.length);
    const side = branchSide(snapshot, parentId);
    return writeTree(
      doc,
      items,
      parentId,
      keys,
      items.map(() => side),
    );
  });
}

/** Copies the given nodes (and their subtrees) into detached outline nodes, in tree order. */
export function serializeSubtrees(snapshot: MapSnapshot, ids: Iterable<string>): OutlineNode[] {
  const tops = new Set(topMost(snapshot, ids));
  const toOutline = (id: string): OutlineNode => {
    const node = snapshot.nodes.get(id)!;
    return {
      text: node.text,
      note: node.note || undefined,
      link: node.link || undefined,
      marker: node.marker,
      shape: node.shape,
      color: node.color,
      collapsed: node.collapsed,
      children: (snapshot.children.get(id) ?? []).map(toOutline),
    };
  };
  return treeOrder(snapshot)
    .filter((id) => tops.has(id))
    .map(toOutline);
}

/** Duplicates each node's subtree directly after it. Returns the new top node ids. */
export function duplicateNodes(doc: Y.Doc, ids: Iterable<string>): string[] {
  return transact(doc, () => {
    const snapshot = readSnapshot(doc);
    const result: string[] = [];
    for (const id of topMost(snapshot, ids)) {
      const node = snapshot.nodes.get(id)!;
      const parentKey = parentKeyOf(snapshot, id);
      const siblings = siblingsOf(snapshot, id);
      const index = siblings.findIndex((s) => s.id === id) + 1;
      const [copy] = serializeSubtrees(snapshot, [id]);
      const keys = keysAt(siblings, index, 1);
      result.push(
        ...writeTree(doc, [copy!], parentKey === ROOT_ID ? null : parentKey, keys, [
          parentKey === ROOT_ID ? node.side : branchSide(snapshot, id),
        ]),
      );
    }
    return result;
  });
}

// ----- deleting ------------------------------------------------------------------------------

/**
 * Deletes nodes and their whole subtrees. Returns the node to select next: the previous sibling
 * of the first deleted node, or else its parent.
 */
export function deleteNodes(doc: Y.Doc, ids: Iterable<string>): string {
  return transact(doc, () => {
    const snapshot = readSnapshot(doc);
    const targets = topMost(snapshot, ids).filter((id) => snapshot.nodes.has(id));
    if (!targets.length) return ROOT_ID;
    const doomed = new Set(targets.flatMap((id) => [id, ...descendantsOf(snapshot, id)]));
    const first = treeOrder(snapshot).find((id) => targets.includes(id))!;
    const siblings = siblingsOf(snapshot, first);
    const index = siblings.findIndex((s) => s.id === first);
    const previous = siblings
      .slice(0, index)
      .reverse()
      .find((s) => !doomed.has(s.id));
    let next = previous?.id ?? parentKeyOf(snapshot, first);
    while (doomed.has(next)) next = parentKeyOf(snapshot, next);
    const nodes = getNodes(doc);
    for (const id of doomed) nodes.delete(id);
    const links = getLinks(doc);
    links.forEach((link, id) => {
      if (doomed.has(link.get('from') as string) || doomed.has(link.get('to') as string)) {
        links.delete(id);
      }
    });
    return next;
  });
}

export function deleteNode(doc: Y.Doc, nodeId: string): string {
  if (nodeId === ROOT_ID) throw new Error('The root is deleted by deleting the map');
  return deleteNodes(doc, [nodeId]);
}

// ----- moving --------------------------------------------------------------------------------

function moveInTransaction(doc: Y.Doc, snapshot: MapSnapshot, nodeId: string, target: MoveTarget) {
  if (nodeId === ROOT_ID || !snapshot.nodes.has(nodeId)) return false;
  if (target.parentId !== ROOT_ID) {
    if (!snapshot.nodes.has(target.parentId)) return false;
    if (target.parentId === nodeId || descendantsOf(snapshot, nodeId).includes(target.parentId)) {
      return false;
    }
  }
  const toRoot = target.parentId === ROOT_ID;
  const side = toRoot ? (target.side ?? 'right') : branchSide(snapshot, target.parentId);
  const siblings = childrenOf(snapshot, target.parentId, toRoot ? side : undefined).filter(
    (s) => s.id !== nodeId,
  );
  const map = getNodes(doc).get(nodeId)!;
  map.set('parentId', toRoot ? null : target.parentId);
  map.set('side', side);
  map.set('order', keysAt(siblings, target.index, 1)[0]!);
  if (!toRoot) getNodes(doc).get(target.parentId)?.set('collapsed', false);
  return true;
}

/** Moves a node and its subtree. Returns false if the move is invalid (e.g. into itself). */
export function moveSubtree(doc: Y.Doc, nodeId: string, target: MoveTarget): boolean {
  return transact(doc, () => moveInTransaction(doc, readSnapshot(doc), nodeId, target));
}

/** Moves a node one place up (-1) or down (+1) among its siblings. */
export function moveAmongSiblings(doc: Y.Doc, nodeId: string, delta: -1 | 1): boolean {
  return transact(doc, () => {
    const snapshot = readSnapshot(doc);
    const siblings = siblingsOf(snapshot, nodeId);
    const index = siblings.findIndex((s) => s.id === nodeId);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= siblings.length) return false;
    const parentKey = parentKeyOf(snapshot, nodeId);
    return moveInTransaction(doc, snapshot, nodeId, {
      parentId: parentKey,
      side: snapshot.nodes.get(nodeId)!.side,
      index: target,
    });
  });
}

/** Makes a node the last child of its previous sibling. */
export function indentNode(doc: Y.Doc, nodeId: string): boolean {
  return transact(doc, () => {
    const snapshot = readSnapshot(doc);
    const siblings = siblingsOf(snapshot, nodeId);
    const previous = siblings[siblings.findIndex((s) => s.id === nodeId) - 1];
    if (!previous) return false;
    return moveInTransaction(doc, snapshot, nodeId, {
      parentId: previous.id,
      index: childrenOf(snapshot, previous.id).length,
    });
  });
}

/** Moves a node out one level, to just after its parent. */
export function outdentNode(doc: Y.Doc, nodeId: string): boolean {
  return transact(doc, () => {
    const snapshot = readSnapshot(doc);
    const parentId = parentKeyOf(snapshot, nodeId);
    if (parentId === ROOT_ID) return false;
    const grandparent = parentKeyOf(snapshot, parentId);
    const parentSiblings = siblingsOf(snapshot, parentId);
    return moveInTransaction(doc, snapshot, nodeId, {
      parentId: grandparent,
      side: snapshot.nodes.get(parentId)!.side,
      index: parentSiblings.findIndex((s) => s.id === parentId) + 1,
    });
  });
}

// ----- cross-links ---------------------------------------------------------------------------

/**
 * Connects two nodes with a cross-link. Returns the link id, or null when it would link a node to
 * itself or duplicate an existing link between the same two nodes.
 */
export function addLink(doc: Y.Doc, from: string, to: string): string | null {
  if (from === to) return null;
  return transact(doc, () => {
    const snapshot = readSnapshot(doc);
    const exists = (id: string) => id === ROOT_ID || snapshot.nodes.has(id);
    if (!exists(from) || !exists(to)) return null;
    const duplicate = snapshot.links.some(
      (l) => (l.from === from && l.to === to) || (l.from === to && l.to === from),
    );
    if (duplicate) return null;
    const id = crypto.randomUUID();
    const link = new Y.Map<unknown>();
    link.set('from', from);
    link.set('to', to);
    link.set('label', '');
    getLinks(doc).set(id, link);
    return id;
  });
}

export function setLinkLabel(doc: Y.Doc, linkId: string, label: string): void {
  transact(doc, () => {
    const link = getLinks(doc).get(linkId);
    const value = label.replace(/\s+/g, ' ').trim().slice(0, 120);
    if (link && link.get('label') !== value) link.set('label', value);
  });
}

export function deleteLink(doc: Y.Doc, linkId: string): void {
  transact(doc, () => getLinks(doc).delete(linkId));
}

// ----- collapsing ----------------------------------------------------------------------------

/** Toggles (or sets) whether a node's children are hidden. Returns the new state. */
export function setCollapsed(doc: Y.Doc, nodeId: string, collapsed?: boolean): boolean {
  return transact(doc, () => {
    const map = getNodes(doc).get(nodeId);
    if (!map) return false;
    const next = collapsed ?? map.get('collapsed') !== true;
    if ((map.get('collapsed') === true) !== next) map.set('collapsed', next);
    return next;
  });
}

/**
 * Shows the map down to `level` (1 = first-level branches only) and collapses everything
 * deeper. `Infinity` expands everything.
 */
export function showLevels(doc: Y.Doc, level: number): void {
  transact(doc, () => {
    const snapshot = readSnapshot(doc);
    const nodes = getNodes(doc);
    for (const [id, node] of snapshot.nodes) {
      const hasChildren = (snapshot.children.get(id)?.length ?? 0) > 0;
      const collapsed = hasChildren && depthOf(snapshot, id) >= level;
      if (node.collapsed !== collapsed) nodes.get(id)?.set('collapsed', collapsed);
    }
  });
}

/** Not undoable: changes that only affect what is on screen (e.g. search revealing a node). */
export const VIEW_ORIGIN = { name: 'eqapmap-view' };

/** Expands every collapsed ancestor so the node is visible. */
export function revealNode(doc: Y.Doc, nodeId: string, undoable = true): boolean {
  let changed = false;
  const reveal = () => {
    const snapshot = readSnapshot(doc);
    for (const id of ancestorsOf(snapshot, nodeId)) {
      if (snapshot.nodes.get(id)?.collapsed) {
        getNodes(doc).get(id)?.set('collapsed', false);
        changed = true;
      }
    }
  };
  doc.transact(reveal, undoable ? LOCAL_ORIGIN : VIEW_ORIGIN);
  return changed;
}

// ----- content and style ---------------------------------------------------------------------

export function setText(doc: Y.Doc, nodeId: string, text: string): void {
  transact(doc, () => {
    const target = getNodeText(doc, nodeId);
    if (target) applyTextDiff(target, text);
  });
}

export function setNote(doc: Y.Doc, nodeId: string, note: string): void {
  transact(doc, () => {
    const map = getNodes(doc).get(nodeId);
    if (!map) return;
    let text = map.get('note');
    if (!(text instanceof Y.Text)) {
      if (!note) return;
      text = new Y.Text();
      map.set('note', text);
    }
    applyTextDiff(text as Y.Text, note);
  });
}

export function setLink(doc: Y.Doc, nodeId: string, link: string): void {
  transact(doc, () => {
    const map = getNodes(doc).get(nodeId);
    if (!map) return;
    const value = link.trim();
    if (value) map.set('link', value);
    else map.delete('link');
  });
}

export function setStyle(
  doc: Y.Doc,
  nodeIds: string | Iterable<string>,
  patch: Partial<{ shape: Shape; color: string; marker: Marker | null }>,
): void {
  const ids = typeof nodeIds === 'string' ? [nodeIds] : [...nodeIds];
  transact(doc, () => {
    for (const id of ids) {
      const map = getNodes(doc).get(id);
      if (!map) continue;
      if (patch.shape !== undefined) map.set('shape', patch.shape);
      if (patch.color !== undefined) map.set('color', patch.color);
      if (patch.marker !== undefined) {
        if (patch.marker) map.set('marker', patch.marker);
        else map.delete('marker');
      }
    }
  });
}

export function setSettings(doc: Y.Doc, patch: Partial<MapSettings>): void {
  transact(doc, () => {
    const settings = getSettings(doc);
    for (const [key, value] of Object.entries(patch)) {
      if (settings.get(key) !== value) settings.set(key, value);
    }
  });
}

/** Makes a map of Y.Maps (nodes, links) match `source`, editing in place where possible. */
function copyMapOfMaps(target: Y.Map<Y.Map<unknown>>, source: Y.Map<Y.Map<unknown>>): void {
  for (const id of [...target.keys()]) if (!source.has(id)) target.delete(id);
  source.forEach((sourceMap, id) => {
    let map = target.get(id);
    if (!map) {
      map = new Y.Map<unknown>();
      target.set(id, map);
    }
    for (const key of [...map.keys()]) if (!sourceMap.has(key)) map.delete(key);
    sourceMap.forEach((value, key) => {
      if (value instanceof Y.Text) {
        const current = map.get(key);
        if (current instanceof Y.Text) applyTextDiff(current, value.toString());
        else map.set(key, new Y.Text(value.toString()));
      } else if (map.get(key) !== value) {
        map.set(key, value);
      }
    });
  });
}

/**
 * Makes `doc` match `source` (an older version of the same map), as one undoable change that
 * syncs to every open tab: nodes missing from the source are deleted, others are updated.
 */
export function replaceContent(doc: Y.Doc, source: Y.Doc): void {
  transact(doc, () => {
    applyTextDiff(getTitle(doc), getTitle(source).toString());
    const settings = getSettings(doc);
    const sourceSettings = getSettings(source);
    for (const key of [...settings.keys()]) if (!sourceSettings.has(key)) settings.delete(key);
    sourceSettings.forEach((value, key) => {
      if (settings.get(key) !== value) settings.set(key, value);
    });

    for (const [target, from] of [
      [getNodes(doc), getNodes(source)],
      [getLinks(doc), getLinks(source)],
    ] as const) {
      copyMapOfMaps(target, from);
    }
  });
}

const SCHEMA_VERSION = 2;
const MIGRATION_ORIGIN = { name: 'eqapmap-migration' };

/**
 * Upgrades maps made by earlier versions, once. Version 1 stored white as every node's default
 * colour; version 2 uses the theme's automatic colours instead. Not undoable (it isn't an edit).
 */
export function upgradeDocument(doc: Y.Doc): boolean {
  const settings = getSettings(doc);
  const version = Number(settings.get('schemaVersion') ?? 1);
  if (version >= SCHEMA_VERSION) return false;
  doc.transact(() => {
    if (version < 2) {
      getNodes(doc).forEach((map) => {
        if (map.get('color') === '#ffffff') map.set('color', DEFAULT_STYLE.color);
      });
    }
    settings.set('schemaVersion', SCHEMA_VERSION);
  }, MIGRATION_ORIGIN);
  return true;
}

/**
 * Builds a new map document from a title and an outline. First-level branches alternate
 * right/left so the map starts balanced.
 */
export function buildMapDoc(
  title: string,
  outline: OutlineNode[] = [],
  settings: Partial<MapSettings> = {},
): Y.Doc {
  const doc = new Y.Doc();
  doc.transact(() => {
    getTitle(doc).insert(0, title);
    getSettings(doc).set('schemaVersion', SCHEMA_VERSION);
    for (const [key, value] of Object.entries(settings)) getSettings(doc).set(key, value);
    // keys for first-level nodes are shared across both sides; order only matters per side
    writeTree(
      doc,
      outline,
      null,
      generateNKeysBetween(null, null, outline.length),
      outline.map((_, i) => (i % 2 === 0 ? 'right' : 'left')),
    );
  });
  return doc;
}
