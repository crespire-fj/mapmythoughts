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
 *
 * A node marked `steps` lays out its whole branch as a small top-down tree hanging under it
 * (across it, in a vertical map): single-child chains run straight on, real branch points split
 * side by side. The block is sized first and then treated as one unit by the two-sided layout.
 */
export const H_GAP = 100; // parent edge to child edge, horizontal maps
export const V_GAP = 64; // parent edge to child edge, vertical maps
export const SIBLING_GAP = 40;
export const ROOT_SIBLING_GAP = 60; // between first-level branches
export const STEP_GAP = 30; // parent edge to child edge inside a steps branch
export const STEP_SIBLING_GAP = 28; // between siblings inside a steps branch

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
  /** how this node hangs from its parent: connectors and arrow keys follow it */
  flow: Orientation;
  /** which way along `flow` it hangs ('right' is down or right) */
  flowSide: Side;
  /** how this node's own children hang: across the map inside a steps branch */
  childFlow: Orientation;
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
    if (isSteps(id)) {
      const depth = stepDepth(id, new Set());
      spans.set(id, depth);
      return depth;
    }
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

  // ----- steps branches, in the same main/cross terms: a steps block grows along the cross axis.
  const across: Orientation = vertical ? 'horizontal' : 'vertical';
  const isSteps = (id: string) => !!snapshot.nodes.get(id)?.steps && visibleChildren(id).length > 0;
  /** Width of a steps subtree along the main axis (its siblings sit side by side). */
  const stepWidths = new Map<string, number>();
  const stepWidth = (id: string, trail: Set<string>): number => {
    const cached = stepWidths.get(id);
    if (cached !== undefined) return cached;
    const own = sizeOf(id).width;
    if (trail.has(id)) return own;
    trail.add(id);
    const kids = visibleChildren(id);
    const total =
      kids.reduce((sum, kid) => sum + stepWidth(kid, trail), 0) +
      STEP_SIBLING_GAP * Math.max(0, kids.length - 1);
    trail.delete(id);
    const width = Math.max(own, total);
    stepWidths.set(id, width);
    return width;
  };
  /** Depth of a steps subtree along the cross axis, including the node itself. */
  const stepDepths = new Map<string, number>();
  const stepDepth = (id: string, trail: Set<string>): number => {
    const cached = stepDepths.get(id);
    if (cached !== undefined) return cached;
    const own = sizeOf(id).height;
    if (trail.has(id)) return own;
    trail.add(id);
    const kids = visibleChildren(id);
    const below = kids.length ? STEP_GAP + Math.max(...kids.map((k) => stepDepth(k, trail))) : 0;
    trail.delete(id);
    stepDepths.set(id, own + below);
    return own + below;
  };

  const rootSize = sizeOf(ROOT_ID);
  const nodes = new Map<string, LayoutNode>();

  /** Places the children of a steps node in a row below it, each centred over its own subtree. */
  const placeSteps = (
    ids: string[],
    parentId: string,
    parentMain: number,
    parentBottom: number,
    side: Side,
    depth: number,
  ) => {
    if (!ids.length) return;
    const total =
      ids.reduce((sum, id) => sum + stepWidth(id, new Set()), 0) +
      STEP_SIBLING_GAP * (ids.length - 1);
    let start = parentMain - total / 2;
    for (const id of ids) {
      if (nodes.has(id)) continue;
      const size = sizeOf(id);
      const width = stepWidth(id, new Set());
      const main = start + width / 2;
      const top = parentBottom + STEP_GAP;
      nodes.set(id, {
        id,
        side,
        depth,
        parentId,
        flow: across,
        flowSide: 'right',
        childFlow: across,
        box: { x: main - size.width / 2, y: top, ...size },
      });
      placeSteps(visibleChildren(id), id, main, top + size.height, side, depth + 1);
      start += width + STEP_SIBLING_GAP;
    }
  };

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
      if (isSteps(id)) {
        // The block's near edge sits where a plain child's would; the node tops its block.
        const width = stepWidth(id, new Set());
        const main = parentMain + dir * (parentHalf + mainGap + width / 2);
        nodes.set(id, {
          id,
          side,
          depth,
          parentId,
          flow: orientation,
          flowSide: side,
          childFlow: across,
          box: { x: main - size.width / 2, y: start, ...size },
        });
        placeSteps(visibleChildren(id), id, main, start + size.height, side, depth + 1);
        start += span + gap;
        continue;
      }
      const main = parentMain + dir * (parentHalf + mainGap + size.width / 2);
      const cross = start + span / 2;
      nodes.set(id, {
        id,
        side,
        depth,
        parentId,
        flow: orientation,
        flowSide: side,
        childFlow: orientation,
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

/** Position along the sibling-stacking axis of nodes that hang in `flow` (y for horizontal). */
export function crossCenter(flow: Orientation, box: Box): number {
  return flow === 'vertical' ? box.x + box.width / 2 : box.y + box.height / 2;
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
