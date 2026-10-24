import {
  ROOT_ID,
  branchSide,
  childrenOf,
  type MapSnapshot,
  type Orientation,
  type Side,
} from '../model/schema';

/**
 * Two-sided tree layout. Pure: no DOM, React or Yjs. Coordinates are world units with the root's
 * centre at (0, 0).
 *
 * The algorithm works in "main axis" (parent → child) and "cross axis" (sibling stacking) terms.
 * Horizontal maps grow left/right; vertical maps are laid out by swapping each node's width and
 * height going in and swapping the axes coming out, so both share one tested algorithm. In a
 * vertical map, side 'right' means below the root and 'left' means above it.
 */
export const H_GAP = 100; // parent edge to child edge, horizontal maps
export const V_GAP = 64; // parent edge to child edge, vertical maps
export const SIBLING_GAP = 40;
export const ROOT_SIBLING_GAP = 60; // between first-level branches

export interface Size {
  width: number;
  height: number;
}

export interface Box {
  x: number; // left
  y: number; // top
  width: number;
  height: number;
}

export interface LayoutNode {
  id: string;
  side: Side;
  depth: number;
  box: Box;
  parentId: string; // ROOT_ID for first-level nodes
}

export interface LayoutResult {
  orientation: Orientation;
  root: Box;
  nodes: Map<string, LayoutNode>;
}

/** A virtual node (drag placeholder) laid out as if it were a real child. */
export interface Phantom {
  id: string;
  parentId: string;
  side: Side;
  index: number;
  size: Size;
}

export interface LayoutOptions {
  /** node ids (and their subtrees) to leave out, e.g. while being dragged */
  exclude?: ReadonlySet<string>;
  phantom?: Phantom | null;
  /** defaults to the map's own setting */
  orientation?: Orientation;
}

const FALLBACK_SIZE: Size = { width: 120, height: 40 };

export function computeLayout(
  snapshot: MapSnapshot,
  sizes: ReadonlyMap<string, Size>,
  options: LayoutOptions = {},
): LayoutResult {
  const orientation = options.orientation ?? snapshot.settings.orientation;
  const vertical = orientation === 'vertical';
  const mainGap = vertical ? V_GAP : H_GAP;
  const exclude = options.exclude ?? new Set<string>();
  const phantom = options.phantom ?? null;
  const rawSize = (id: string): Size =>
    id === phantom?.id ? phantom.size : (sizes.get(id) ?? FALLBACK_SIZE);
  // In main/cross terms: "width" is along the main axis, "height" along the cross axis.
  const sizeOf = (id: string): Size => {
    const size = rawSize(id);
    return vertical ? { width: size.height, height: size.width } : size;
  };

  const visibleChildren = (id: string, side?: Side): string[] => {
    if (id !== ROOT_ID && snapshot.nodes.get(id)?.collapsed) return [];
    const ids = childrenOf(snapshot, id, side)
      .map((n) => n.id)
      .filter((childId) => !exclude.has(childId));
    if (phantom && phantom.parentId === id && (id !== ROOT_ID || phantom.side === side)) {
      ids.splice(Math.max(0, Math.min(phantom.index, ids.length)), 0, phantom.id);
    }
    return ids;
  };

  const spans = new Map<string, number>();
  const subtreeSpan = (id: string, trail: Set<string>): number => {
    const cached = spans.get(id);
    if (cached !== undefined) return cached;
    const own = sizeOf(id).height;
    if (trail.has(id)) return own; // defensive: a cycle in corrupt data must not hang the app
    trail.add(id);
    const kids = visibleChildren(id);
    let span = own;
    if (kids.length) {
      const total =
        kids.reduce((sum, kid) => sum + subtreeSpan(kid, trail), 0) +
        SIBLING_GAP * (kids.length - 1);
      span = Math.max(own, total);
    }
    trail.delete(id);
    spans.set(id, span);
    return span;
  };

  const rootSize = sizeOf(ROOT_ID);
  const nodes = new Map<string, LayoutNode>();

  const place = (
    ids: string[],
    parentId: string,
    parentMain: number,
    parentCross: number,
    parentHalf: number,
    gap: number,
    side: Side,
    depth: number,
  ) => {
    if (!ids.length) return;
    const dir = side === 'right' ? 1 : -1;
    const total =
      ids.reduce((sum, id) => sum + subtreeSpan(id, new Set()), 0) + gap * (ids.length - 1);
    let start = parentCross - total / 2;
    for (const id of ids) {
      if (nodes.has(id)) continue;
      const size = sizeOf(id);
      const span = subtreeSpan(id, new Set());
      const main = parentMain + dir * (parentHalf + mainGap + size.width / 2);
      const cross = start + span / 2;
      nodes.set(id, {
        id,
        side,
        depth,
        parentId,
        box: { x: main - size.width / 2, y: cross - size.height / 2, ...size },
      });
      place(visibleChildren(id), id, main, cross, size.width / 2, SIBLING_GAP, side, depth + 1);
      start += span + gap;
    }
  };

  for (const side of ['right', 'left'] as const) {
    place(
      visibleChildren(ROOT_ID, side),
      ROOT_ID,
      0,
      0,
      rootSize.width / 2,
      ROOT_SIBLING_GAP,
      side,
      1,
    );
  }

  const swap = (box: Box): Box =>
    vertical ? { x: box.y, y: box.x, width: box.height, height: box.width } : box;
  for (const node of nodes.values()) node.box = swap(node.box);
  return {
    orientation,
    root: swap({
      x: -rootSize.width / 2,
      y: -rootSize.height / 2,
      width: rootSize.width,
      height: rootSize.height,
    }),
    nodes,
  };
}

export function sideOf(snapshot: MapSnapshot, layout: LayoutResult, id: string): Side {
  return layout.nodes.get(id)?.side ?? branchSide(snapshot, id);
}

export function boxOf(layout: LayoutResult, id: string): Box | undefined {
  return id === ROOT_ID ? layout.root : layout.nodes.get(id)?.box;
}

export function contains(box: Box, x: number, y: number): boolean {
  return x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height;
}

export function intersects(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** Position along the sibling-stacking axis (y in horizontal maps, x in vertical ones). */
export function crossCenter(layout: LayoutResult, box: Box): number {
  return layout.orientation === 'vertical' ? box.x + box.width / 2 : box.y + box.height / 2;
}

/** Which side of the root a point is on. */
export function sideAt(layout: LayoutResult, point: { x: number; y: number }): Side {
  const main = layout.orientation === 'vertical' ? point.y : point.x;
  return main < 0 ? 'left' : 'right';
}

export function layoutBounds(layout: LayoutResult): Box {
  let minX = layout.root.x;
  let minY = layout.root.y;
  let maxX = layout.root.x + layout.root.width;
  let maxY = layout.root.y + layout.root.height;
  for (const { box } of layout.nodes.values()) {
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.width);
    maxY = Math.max(maxY, box.y + box.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
