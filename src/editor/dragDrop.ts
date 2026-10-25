import type { MoveTarget } from '../commands/commands';
import {
  contains,
  crossCenter,
  sideAt,
  type LayoutResult,
  type Phantom,
  type Size,
} from '../layout/layout';
import { ROOT_ID, childrenOf, parentKeyOf, siblingsOf, type MapSnapshot } from '../model/schema';

export const PLACEHOLDER_ID = '__placeholder';

/**
 * Where a dragged subtree would land if dropped at `point` (world coordinates). `layout` must be
 * computed without the dragged subtree, so hit-testing doesn't move as the placeholder appears.
 *
 * - Over a node: append as its last child.
 * - Over the root: append to the side of the root the pointer is on.
 * - Elsewhere: stay under the current parent and reorder by the pointer's position.
 */
export function resolveDropTarget(
  snapshot: MapSnapshot,
  layout: LayoutResult,
  nodeId: string,
  point: { x: number; y: number },
): MoveTarget {
  const notDragged = (id: string) => id !== nodeId;

  for (const [id, node] of layout.nodes) {
    if (id === PLACEHOLDER_ID || !contains(node.box, point.x, point.y)) continue;
    return { parentId: id, index: childrenOf(snapshot, id).filter((n) => notDragged(n.id)).length };
  }
  if (contains(layout.root, point.x, point.y)) {
    const side = sideAt(layout, point);
    const count = childrenOf(snapshot, ROOT_ID, side).filter((n) => notDragged(n.id)).length;
    return { parentId: ROOT_ID, side, index: count };
  }

  const parentId = parentKeyOf(snapshot, nodeId);
  const side = parentId === ROOT_ID ? sideAt(layout, point) : undefined;
  const siblings = childrenOf(snapshot, parentId, side).filter((n) => notDragged(n.id));
  // Siblings inside a steps branch sit side by side across the map's own orientation.
  const flow =
    siblings.map((n) => layout.nodes.get(n.id)?.flow).find(Boolean) ?? layout.orientation;
  const pointCross = flow === 'vertical' ? point.x : point.y;
  let index = 0;
  for (const sibling of siblings) {
    const box = layout.nodes.get(sibling.id)?.box;
    if (box && pointCross > crossCenter(flow, box)) index++;
  }
  return { parentId, side, index };
}

/** True when dropping at `target` would leave the node exactly where it is. */
export function isNoOpMove(snapshot: MapSnapshot, nodeId: string, target: MoveTarget): boolean {
  const node = snapshot.nodes.get(nodeId);
  if (!node || parentKeyOf(snapshot, nodeId) !== target.parentId) return false;
  if (target.parentId === ROOT_ID && target.side !== node.side) return false;
  const siblings = siblingsOf(snapshot, nodeId);
  return siblings.findIndex((s) => s.id === nodeId) === target.index;
}

export function placeholderFor(layout: LayoutResult, target: MoveTarget, size: Size): Phantom {
  const side =
    target.parentId === ROOT_ID
      ? (target.side ?? 'right')
      : (layout.nodes.get(target.parentId)?.side ?? 'right');
  return { id: PLACEHOLDER_ID, parentId: target.parentId, side, index: target.index, size };
}
