import type { Box } from '../layout/layout';
import type { ConnectorStyle, Orientation, Side } from '../model/schema';

export interface Point {
  x: number;
  y: number;
}

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Midpoint of the box edge facing `side`. In vertical maps 'right' is the bottom edge and 'left'
 * the top edge.
 */
export function edgePoint(box: Box, side: Side, orientation: Orientation = 'horizontal'): Point {
  if (orientation === 'vertical') {
    return { x: box.x + box.width / 2, y: side === 'right' ? box.y + box.height : box.y };
  }
  return { x: side === 'right' ? box.x + box.width : box.x, y: box.y + box.height / 2 };
}

const opposite = (side: Side): Side => (side === 'right' ? 'left' : 'right');

/**
 * Curved connector from the parent's edge (on the child's side) to the child's facing edge.
 * Control points sit 40% of the main-axis distance along, at least 20 units.
 */
export function curvedConnector(
  parent: Box,
  child: Box,
  side: Side,
  orientation: Orientation = 'horizontal',
): string {
  const start = edgePoint(parent, side, orientation);
  const end = edgePoint(child, opposite(side), orientation);
  const dir = side === 'right' ? 1 : -1;
  if (orientation === 'vertical') {
    const offset = Math.max(0.4 * Math.abs(end.y - start.y), 20) * dir;
    return `M ${round(start.x)} ${round(start.y)} C ${round(start.x)} ${round(start.y + offset)}, ${round(end.x)} ${round(end.y - offset)}, ${round(end.x)} ${round(end.y)}`;
  }
  const offset = Math.max(0.4 * Math.abs(end.x - start.x), 20) * dir;
  return `M ${round(start.x)} ${round(start.y)} C ${round(start.x + offset)} ${round(start.y)}, ${round(end.x - offset)} ${round(end.y)}, ${round(end.x)} ${round(end.y)}`;
}

/**
 * Elbow (org-chart) connector: out from the parent along the main axis, along a shared trunk
 * halfway to the children, then into the child, with rounded corners.
 */
export function elbowConnector(
  parent: Box,
  child: Box,
  side: Side,
  orientation: Orientation = 'horizontal',
  radius = 8,
): string {
  const start = edgePoint(parent, side, orientation);
  const end = edgePoint(child, opposite(side), orientation);
  const vertical = orientation === 'vertical';
  // main/cross accessors so one routine draws both orientations
  const main = (p: Point) => (vertical ? p.y : p.x);
  const cross = (p: Point) => (vertical ? p.x : p.y);
  const point = (m: number, c: number) =>
    vertical ? `${round(c)} ${round(m)}` : `${round(m)} ${round(c)}`;

  const dir = side === 'right' ? 1 : -1;
  const trunk = main(start) + (main(end) - main(start)) / 2;
  const dc = cross(end) - cross(start);
  if (Math.abs(dc) < 0.5)
    return `M ${point(main(start), cross(start))} L ${point(main(end), cross(end))}`;
  const sign = dc > 0 ? 1 : -1;
  const r = Math.min(radius, Math.abs(dc) / 2, Math.abs(trunk - main(start)));
  return [
    `M ${point(main(start), cross(start))}`,
    `L ${point(trunk - dir * r, cross(start))}`,
    `Q ${point(trunk, cross(start))} ${point(trunk, cross(start) + sign * r)}`,
    `L ${point(trunk, cross(end) - sign * r)}`,
    `Q ${point(trunk, cross(end))} ${point(trunk + dir * r, cross(end))}`,
    `L ${point(main(end), cross(end))}`,
  ].join(' ');
}

/**
 * The box a connector should attach to. Underline-style nodes in horizontal maps connect at
 * their underline rather than their middle.
 */
export function attachBox(box: Box, shape: string | undefined, orientation: Orientation): Box {
  if (shape !== 'underline' || orientation === 'vertical') return box;
  return { ...box, y: box.y + box.height - 1.5, height: 0 };
}

export function connectorPath(
  style: ConnectorStyle,
  parent: Box,
  child: Box,
  side: Side,
  orientation: Orientation,
): string {
  return style === 'elbow'
    ? elbowConnector(parent, child, side, orientation)
    : curvedConnector(parent, child, side, orientation);
}

/**
 * The connector into a laid-out node. It follows the way the node hangs from its parent, which
 * inside a steps branch runs across the map's own orientation.
 */
export function treeConnector(
  style: ConnectorStyle,
  parent: Box,
  parentShape: string | undefined,
  child: { box: Box; flow: Orientation; flowSide: Side },
  childShape: string | undefined,
): string {
  return connectorPath(
    style,
    attachBox(parent, parentShape, child.flow),
    attachBox(child.box, childShape, child.flow),
    child.flowSide,
    child.flow,
  );
}

/** Where the line from a box's centre towards `toward` leaves the box. */
function boxExit(box: Box, toward: Point): Point {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const dx = toward.x - cx;
  const dy = toward.y - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const scale = Math.min(
    dx === 0 ? Infinity : box.width / 2 / Math.abs(dx),
    dy === 0 ? Infinity : box.height / 2 / Math.abs(dy),
  );
  return { x: cx + dx * scale, y: cy + dy * scale };
}

export interface CrossLinkGeometry {
  path: string;
  /** midpoint of the curve, where the label sits */
  middle: Point;
}

/**
 * A cross-link: a gentle curve from the edge of one box to the edge of another (bulging to one
 * side so it doesn't sit on top of tree connectors), leaving a small gap for the arrowhead.
 */
export function crossLink(from: Box, to: Box | Point, gap = 6): CrossLinkGeometry {
  const toCenter = 'width' in to ? { x: to.x + to.width / 2, y: to.y + to.height / 2 } : to;
  const fromCenter = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
  const start = boxExit(from, toCenter);
  let end = 'width' in to ? boxExit(to, fromCenter) : to;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy) || 1;
  if ('width' in to) end = { x: end.x - (dx / length) * gap, y: end.y - (dy / length) * gap };
  const bulge = Math.min(length * 0.22, 90);
  const control = {
    x: (start.x + end.x) / 2 - (dy / length) * bulge,
    y: (start.y + end.y) / 2 + (dx / length) * bulge,
  };
  return {
    path: `M ${round(start.x)} ${round(start.y)} Q ${round(control.x)} ${round(control.y)} ${round(end.x)} ${round(end.y)}`,
    middle: {
      x: 0.25 * start.x + 0.5 * control.x + 0.25 * end.x,
      y: 0.25 * start.y + 0.5 * control.y + 0.25 * end.y,
    },
  };
}
