import fontUrl from '@fontsource-variable/plus-jakarta-sans/files/plus-jakarta-sans-latin-wght-normal.woff2?url';
import { attachBox, connectorPath, crossLink } from '../connectors/connectors';
import { MARKER_INFO } from '../editor/markers';
import { boxOf, layoutBounds, type Box, type LayoutResult } from '../layout/layout';
import { ROOT_ID, type MapSnapshot } from '../model/schema';
import { THEMES, branchColors, nodeAppearance, rootAppearance } from '../theme/themes';

// Keep in sync with the .node rules in styles.css.
export const FONT_FAMILY = "'Plus Jakarta Sans Variable', system-ui, -apple-system, sans-serif";
const TYPE = {
  root: { size: 20, line: 28, weight: 700, padX: 26, tracking: -0.2 },
  first: { size: 15, line: 22, weight: 600, padX: 18, tracking: 0 },
  other: { size: 14, line: 20, weight: 500, padX: 14, tracking: 0 },
};
const MARKER_SPACE = 22;
const LINK_COLOR = '#64748b';
const PADDING = 48;

let fontData: Promise<string> | null = null;
/** The app font as a data URL, so exported images look the same on any machine. */
function embeddedFont(): Promise<string> {
  fontData ??= fetch(fontUrl)
    .then((response) => response.blob())
    .then(
      (blob) =>
        new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        }),
    );
  return fontData;
}

let measureContext: CanvasRenderingContext2D | null = null;

function wrap(text: string, font: string, maxWidth: number, tracking = 0): string[] {
  measureContext ??= document.createElement('canvas').getContext('2d');
  const ctx = measureContext!;
  ctx.font = font;
  ctx.letterSpacing = `${tracking}px`;
  // The node was sized by the browser's own text layout; allow for rounding differences.
  maxWidth += 2;
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/(\s+)/)) {
      const candidate = line + word;
      if (line && ctx.measureText(candidate.trimEnd()).width > maxWidth) {
        lines.push(line.trimEnd());
        line = word.trimStart();
      } else {
        line = candidate;
      }
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

const escape = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function radius(shape: string, box: Box): number {
  if (shape === 'pill' || shape === 'root') return box.height / 2;
  if (shape === 'rect') return 4;
  return 12;
}

/** A standalone SVG of the whole map, in light mode (collapsed branches stay collapsed). */
export async function buildSvg(snapshot: MapSnapshot, layout: LayoutResult): Promise<string> {
  await document.fonts.ready;
  const font = await embeddedFont().catch(() => null);
  const theme = THEMES[snapshot.settings.theme];
  const colors = branchColors(snapshot, theme);
  const bounds = layoutBounds(layout);
  const width = Math.ceil(bounds.width + PADDING * 2);
  const height = Math.ceil(bounds.height + PADDING * 2);
  const parts: string[] = [];

  for (const node of layout.nodes.values()) {
    const parent = node.parentId === ROOT_ID ? layout.root : layout.nodes.get(node.parentId)?.box;
    const data = snapshot.nodes.get(node.id);
    if (!parent || !data) continue;
    const look = nodeAppearance(data.color, data.shape, node.depth, colors.get(node.id)!, 'light');
    parts.push(
      `<path d="${connectorPath(
        snapshot.settings.connector,
        attachBox(parent, snapshot.nodes.get(node.parentId)?.shape, layout.orientation),
        attachBox(node.box, data.shape, layout.orientation),
        node.side,
        layout.orientation,
      )}" fill="none" stroke="${look.line}" stroke-width="${look.lineWidth}" stroke-linecap="round"/>`,
    );
  }

  // cross-links, drawn over the tree connectors and under the nodes
  const labels: string[] = [];
  for (const link of snapshot.links) {
    const from = boxOf(layout, link.from);
    const to = boxOf(layout, link.to);
    if (!from || !to) continue;
    const geometry = crossLink(from, to);
    parts.push(
      `<path d="${geometry.path}" fill="none" stroke="${LINK_COLOR}" stroke-width="2" stroke-dasharray="7 5" stroke-linecap="round" marker-end="url(#arrow)"/>`,
    );
    if (link.label) {
      const width = link.label.length * 6.6 + 18;
      labels.push(
        `<rect x="${geometry.middle.x - width / 2}" y="${geometry.middle.y - 12}" width="${width}" height="24" rx="12" fill="#ffffff" stroke="${LINK_COLOR}" stroke-width="1"/>`,
        `<text x="${geometry.middle.x}" y="${geometry.middle.y}" text-anchor="middle" dominant-baseline="central" font-family="${escape(FONT_FAMILY)}" font-size="12" font-weight="600" fill="#334155">${escape(link.label)}</text>`,
      );
    }
  }

  const drawText = (
    box: Box,
    text: string,
    type: (typeof TYPE)['root'],
    color: string,
    inset: number,
  ) => {
    const fontSpec = `${type.weight} ${type.size}px ${FONT_FAMILY}`;
    const lines = wrap(text, fontSpec, box.width - type.padX * 2 - inset, type.tracking);
    const top = box.y + box.height / 2 - (lines.length * type.line) / 2;
    const cx = box.x + inset + (box.width - inset) / 2;
    const tspans = lines
      .map(
        (line, i) =>
          `<tspan x="${cx}" y="${top + type.line * (i + 0.5)}">${escape(line) || ' '}</tspan>`,
      )
      .join('');
    parts.push(
      `<text text-anchor="middle" dominant-baseline="central" font-family="${escape(FONT_FAMILY)}" font-size="${type.size}" font-weight="${type.weight}" letter-spacing="${type.tracking}" fill="${color}">${tspans}</text>`,
    );
  };

  // root
  const root = rootAppearance(theme);
  const r = layout.root;
  parts.push(
    `<defs><marker id="arrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${LINK_COLOR}"/></marker><linearGradient id="root" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${root.from}"/><stop offset="1" stop-color="${root.to}"/></linearGradient></defs>`,
    `<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}" rx="${r.height / 2}" fill="url(#root)"/>`,
  );
  drawText(r, snapshot.title || 'Untitled map', TYPE.root, root.text, 0);

  for (const node of layout.nodes.values()) {
    const data = snapshot.nodes.get(node.id);
    if (!data) continue;
    const box = node.box;
    const look = nodeAppearance(data.color, data.shape, node.depth, colors.get(node.id)!, 'light');
    if (data.shape === 'underline') {
      parts.push(
        `<line x1="${box.x}" y1="${box.y + box.height - 1.5}" x2="${box.x + box.width}" y2="${box.y + box.height - 1.5}" stroke="${look.border}" stroke-width="3" stroke-linecap="round"/>`,
      );
    } else {
      parts.push(
        `<rect x="${box.x + 0.75}" y="${box.y + 0.75}" width="${box.width - 1.5}" height="${box.height - 1.5}" rx="${radius(data.shape, box)}" fill="${look.background}" stroke="${look.border}" stroke-width="1.5"/>`,
      );
    }
    const type = node.depth <= 1 ? TYPE.first : TYPE.other;
    let inset = 0;
    if (data.marker) {
      const info = MARKER_INFO[data.marker];
      const cx = box.x + type.padX + 8;
      const cy = box.y + box.height / 2;
      parts.push(
        `<circle cx="${cx}" cy="${cy}" r="8" fill="${info.color}"/><text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" font-family="${escape(FONT_FAMILY)}" font-size="10" font-weight="700" fill="#ffffff">${escape(info.glyph)}</text>`,
      );
      inset = MARKER_SPACE;
    }
    drawText(box, data.text, type, look.text, inset);
  }

  parts.push(...labels);

  const style = font
    ? `<style>@font-face{font-family:'Plus Jakarta Sans Variable';font-weight:200 800;src:url(${font}) format('woff2');}</style>`
    : '';
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${bounds.x - PADDING} ${bounds.y - PADDING} ${width} ${height}">`,
    style,
    `<rect x="${bounds.x - PADDING}" y="${bounds.y - PADDING}" width="${width}" height="${height}" fill="${theme.canvas.light}"/>`,
    ...parts,
    '</svg>',
  ].join('\n');
}

export async function svgToPng(svg: string, pixelRatio = 2): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas');
    // Browsers cap canvas size; very large maps are scaled down to fit.
    const ratio = Math.min(pixelRatio, 16000 / image.naturalWidth, 16000 / image.naturalHeight);
    canvas.width = Math.ceil(image.naturalWidth * ratio);
    canvas.height = Math.ceil(image.naturalHeight * ratio);
    const ctx = canvas.getContext('2d')!;
    ctx.scale(ratio, ratio);
    ctx.drawImage(image, 0, 0);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('PNG export failed'))),
        'image/png',
      ),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeFilename(title: string): string {
  return (title.trim() || 'mind-map')
    .replace(/[^\w\- ]+/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 60);
}
