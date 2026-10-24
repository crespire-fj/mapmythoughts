import type { Box } from '../layout/layout';

/** Screen = world × scale + (x, y). */
export interface Viewport {
  x: number;
  y: number;
  scale: number;
}

export const MIN_SCALE = 0.15;
export const MAX_SCALE = 3;

export function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

export function toWorld(viewport: Viewport, screenX: number, screenY: number) {
  return { x: (screenX - viewport.x) / viewport.scale, y: (screenY - viewport.y) / viewport.scale };
}

/** Zooms keeping the world point under (screenX, screenY) fixed. */
export function zoomAt(
  viewport: Viewport,
  nextScale: number,
  screenX: number,
  screenY: number,
): Viewport {
  const scale = clampScale(nextScale);
  const world = toWorld(viewport, screenX, screenY);
  return { scale, x: screenX - world.x * scale, y: screenY - world.y * scale };
}

/** Parts of the canvas covered by floating panels, in screen pixels. */
export interface Insets {
  left: number;
  right: number;
}
const NO_INSETS: Insets = { left: 0, right: 0 };

/** Pans the minimum amount needed to show `box` with a margin, clear of any panels. */
export function ensureVisible(
  viewport: Viewport,
  box: Box,
  width: number,
  height: number,
  margin = 48,
  insets: Insets = NO_INSETS,
): Viewport {
  const left = box.x * viewport.scale + viewport.x;
  const top = box.y * viewport.scale + viewport.y;
  const right = left + box.width * viewport.scale;
  const bottom = top + box.height * viewport.scale;
  const minX = insets.left + margin;
  const maxX = width - insets.right - margin;
  let dx = 0;
  let dy = 0;
  if (right > maxX) dx = maxX - right;
  if (left + dx < minX) dx = minX - left;
  if (bottom > height - margin) dy = height - margin - bottom;
  if (top + dy < margin) dy = margin - top;
  return dx || dy ? { ...viewport, x: viewport.x + dx, y: viewport.y + dy } : viewport;
}

/** Fits `bounds` in the uncovered part of the viewport, zooming in no further than `maxScale`. */
export function fitBounds(
  bounds: Box,
  width: number,
  height: number,
  padding = 64,
  insets: Insets = NO_INSETS,
  maxScale = 1,
): Viewport {
  const available = Math.max(width - insets.left - insets.right, 200);
  const scale = clampScale(
    Math.min(
      maxScale,
      (available - padding * 2) / bounds.width,
      (height - padding * 2) / bounds.height,
    ),
  );
  return {
    scale,
    x: insets.left + available / 2 - (bounds.x + bounds.width / 2) * scale,
    y: height / 2 - (bounds.y + bounds.height / 2) * scale,
  };
}
