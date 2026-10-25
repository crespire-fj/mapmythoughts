import type { LayoutResult } from '../layout/layout';
import {
  ROOT_ID,
  branchSide,
  childrenOf,
  parentKeyOf,
  siblingsOf,
  type MapSnapshot,
  type Orientation,
  type Side,
} from '../model/schema';

export type Direction = 'up' | 'down' | 'left' | 'right';

export interface NavigationResult {
  target: string;
  /** a collapsed node that must be expanded so the target becomes visible */
  expand?: string;
}

/**
 * An arrow key in map terms: along the main axis (toward/away from children) or the cross axis
 * (between siblings). Horizontal maps grow left/right; vertical maps grow up/down.
 */
export function logicalDirection(
  direction: Direction,
  orientation: Orientation,
): { axis: 'main' | 'cross'; sign: 1 | -1 } {
  const horizontalKey = direction === 'left' || direction === 'right';
  const sign = direction === 'right' || direction === 'down' ? 1 : -1;
  const axis = horizontalKey === (orientation === 'horizontal') ? 'main' : 'cross';
  return { axis, sign };
}

const childSign = (side: Side) => (side === 'right' ? 1 : -1);

/**
 * Arrow-key navigation: toward a node's children goes to its first child, away from them goes to
 * the parent, and the cross axis moves between siblings.
 */
export function navigate(
  snapshot: MapSnapshot,
  layout: LayoutResult,
  fromId: string,
  direction: Direction,
): NavigationResult | null {
  if (fromId === ROOT_ID) {
    const { axis, sign } = logicalDirection(direction, layout.orientation);
    if (axis !== 'main') return null;
    const first = childrenOf(snapshot, ROOT_ID, sign > 0 ? 'right' : 'left')[0];
    return first ? { target: first.id } : null;
  }
  const node = snapshot.nodes.get(fromId);
  if (!node) return null;
  // Keys follow the way this node hangs from its parent, which inside a steps branch runs
  // across the map: there ↓ goes to the next step and ←/→ move between parallel steps.
  const laid = layout.nodes.get(fromId);
  const side = laid?.flowSide ?? branchSide(snapshot, fromId);
  const { axis, sign } = logicalDirection(direction, laid?.flow ?? layout.orientation);

  if (axis === 'main') {
    if (sign !== childSign(side)) return { target: parentKeyOf(snapshot, fromId) };
    const first = childrenOf(snapshot, fromId)[0];
    if (!first) return null;
    return node.collapsed ? { target: first.id, expand: fromId } : { target: first.id };
  }
  const siblings = siblingsOf(snapshot, fromId);
  const index = siblings.findIndex((s) => s.id === fromId);
  const next = siblings[index + sign];
  return next ? { target: next.id } : null;
}

export type StructuralMove = 'earlier' | 'later' | 'indent' | 'outdent';

/** What ⌥+arrow does to a node: reorder among siblings, or indent/outdent. */
export function structuralMove(
  direction: Direction,
  orientation: Orientation,
  side: Side,
): StructuralMove {
  const { axis, sign } = logicalDirection(direction, orientation);
  if (axis === 'cross') return sign < 0 ? 'earlier' : 'later';
  return sign === childSign(side) ? 'indent' : 'outdent';
}
