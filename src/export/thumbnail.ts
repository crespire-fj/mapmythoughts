import { treeConnector } from '../connectors/connectors';
import { layoutBounds, type LayoutResult } from '../layout/layout';
import { ROOT_ID, type MapSnapshot } from '../model/schema';
import { THEMES, branchColors, nodeAppearance } from '../theme/themes';

const PADDING = 40;
const round = (n: number) => Math.round(n);

/**
 * A small picture of the map's shape for its card: boxes, connectors and cross-links in the
 * theme's colours, without text. Transparent, so the card supplies a light or dark background.
 */
export function buildThumbnail(snapshot: MapSnapshot, layout: LayoutResult): string {
  const theme = THEMES[snapshot.settings.theme];
  const colors = branchColors(snapshot, theme);
  const bounds = layoutBounds(layout);
  const x = round(bounds.x - PADDING);
  const y = round(bounds.y - PADDING);
  const w = round(bounds.width + PADDING * 2);
  const h = round(bounds.height + PADDING * 2);
  // Keep strokes visible however big the map is.
  const stroke = Math.max(1, Math.max(w, h) / 320);
  const parts: string[] = [];

  for (const node of layout.nodes.values()) {
    const data = snapshot.nodes.get(node.id);
    const parent = node.parentId === ROOT_ID ? layout.root : layout.nodes.get(node.parentId)?.box;
    if (!data || !parent) continue;
    const parentShape = snapshot.nodes.get(node.parentId)?.shape;
    const d = treeConnector(snapshot.settings.connector, parent, parentShape, node, data.shape);
    const width = (node.depth <= 1 ? 3.5 : node.depth === 2 ? 2.5 : 2) * (stroke / 1.2);
    parts.push(
      `<path d="${d}" fill="none" stroke="${colors.get(node.id)}" stroke-width="${width.toFixed(1)}" stroke-linecap="round"/>`,
    );
  }
  for (const node of layout.nodes.values()) {
    const data = snapshot.nodes.get(node.id);
    if (!data) continue;
    const look = nodeAppearance(data.color, data.shape, node.depth, colors.get(node.id)!, 'light');
    const b = node.box;
    if (data.shape === 'underline') {
      parts.push(
        `<rect x="${round(b.x)}" y="${round(b.y + b.height - 3)}" width="${round(b.width)}" height="3" fill="${look.border}"/>`,
      );
    } else {
      const r = data.shape === 'pill' ? b.height / 2 : data.shape === 'rect' ? 3 : 10;
      parts.push(
        `<rect x="${round(b.x)}" y="${round(b.y)}" width="${round(b.width)}" height="${round(b.height)}" rx="${round(r)}" fill="${look.background}" stroke="${look.border}" stroke-width="${(stroke * 1.2).toFixed(1)}"/>`,
      );
    }
  }
  const r = layout.root;
  parts.push(
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${theme.root[0]}"/><stop offset="1" stop-color="${theme.root[1]}"/></linearGradient></defs>`,
    `<rect x="${round(r.x)}" y="${round(r.y)}" width="${round(r.width)}" height="${round(r.height)}" rx="${round(r.height / 2)}" fill="url(#g)"/>`,
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}" preserveAspectRatio="xMidYMid meet">${parts.join('')}</svg>`;
}
