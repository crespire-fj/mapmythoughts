import {
  AUTO_COLOR,
  ROOT_ID,
  childrenOf,
  type MapSnapshot,
  type Shape,
  type ThemeId,
} from '../model/schema';

export type ColorMode = 'light' | 'dark';

export interface Theme {
  id: ThemeId;
  name: string;
  description: string;
  /** gradient for the central topic */
  root: [string, string];
  /** first-level branch colours, used in order */
  branches: string[];
  canvas: Record<ColorMode, string>;
}

export const THEMES: Record<ThemeId, Theme> = {
  // The Map My Thoughts brand: thought violet, with candy-bright branches.
  daydream: {
    id: 'daydream',
    name: 'Daydream',
    description: 'Brand violet with candy brights',
    root: ['#3b2a8c', '#6d4aff'],
    branches: ['#6d4aff', '#ff6b8b', '#ffb347', '#2ec4b6', '#4d96ff', '#c77dff', '#ff8c42'],
    canvas: { light: '#f7f5ff', dark: '#100c24' },
  },
  spark: {
    id: 'spark',
    name: 'Spark',
    description: 'Warm pinks and sunshine',
    root: ['#8a1c4a', '#e8457c'],
    branches: ['#e8457c', '#ff8c42', '#ffc845', '#8338ec', '#00bbf9', '#00c49a'],
    canvas: { light: '#fff8f4', dark: '#1a0e14' },
  },
  lagoon: {
    id: 'lagoon',
    name: 'Lagoon',
    description: 'Ocean blues with coral and sunshine',
    root: ['#0b3c5d', '#1597bb'],
    branches: [
      '#1597bb',
      '#f26b5b',
      '#f2a93b',
      '#2bb673',
      '#6d4ee9',
      '#e05297',
      '#00a6a6',
      '#ff8a3d',
    ],
    canvas: { light: '#f3f8fb', dark: '#0b1620' },
  },
  // SPC Visual Identity: core SPC Blue and SPC Cyan lead; secondaries (green, orange, red) and
  // 60% tints of the core colours add distinguishable branches. SPC Purple is reserved by the
  // brand guide for a specific theme, so it is left out.
  spc: {
    id: 'spc',
    name: 'SPC',
    description: 'Pacific Community brand colours',
    root: ['#0046AD', '#00B0CA'],
    branches: ['#00B0CA', '#0046AD', '#58A618', '#DF7A00', '#C60C30', '#66D0DF', '#6690CE'],
    canvas: { light: '#f7fafd', dark: '#07111f' },
  },
  reef: {
    id: 'reef',
    name: 'Reef',
    description: 'Bright tropical contrasts',
    root: ['#134e4a', '#0d9488'],
    branches: [
      '#0d9488',
      '#f97316',
      '#e11d48',
      '#7247e6',
      '#0275b0',
      '#d4a017',
      '#16a34a',
      '#c81f6c',
    ],
    canvas: { light: '#f2faf8', dark: '#081816' },
  },
  sunset: {
    id: 'sunset',
    name: 'Sunset',
    description: 'Warm oranges, pinks and purples',
    root: ['#7c2d12', '#ea580c'],
    branches: [
      '#ea580c',
      '#c81f6c',
      '#7c3aed',
      '#f59e0b',
      '#dc2626',
      '#0891b2',
      '#65a30d',
      '#c026d3',
    ],
    canvas: { light: '#fdf7f3', dark: '#1a0f0a' },
  },
  forest: {
    id: 'forest',
    name: 'Forest',
    description: 'Calm greens and earth tones',
    root: ['#14532d', '#15803d'],
    branches: [
      '#15803d',
      '#b45309',
      '#0f766e',
      '#a16207',
      '#4d7c0f',
      '#9f1239',
      '#1d4ed8',
      '#6d28d9',
    ],
    canvas: { light: '#f5f8f2', dark: '#0c140d' },
  },
  mono: {
    id: 'mono',
    name: 'Ink',
    description: 'Monochrome, for printing and formal papers',
    root: ['#111827', '#374151'],
    branches: [
      '#334155',
      '#475569',
      '#1f2937',
      '#52525b',
      '#3f3f46',
      '#57534e',
      '#44403c',
      '#4b5563',
    ],
    canvas: { light: '#f7f7f8', dark: '#111214' },
  },
};

// ----- colour maths --------------------------------------------------------------------------

function parseHex(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? [...value].map((c) => c + c).join('') : value;
  const n = Number.parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b]
    .map((c) =>
      Math.round(Math.min(255, Math.max(0, c)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

/** Mixes `amount` (0–1) of colour `a` into colour `b`. */
export function mix(a: string, b: string, amount: number): string {
  const ca = parseHex(a);
  const cb = parseHex(b);
  return toHex(
    [0, 1, 2].map((i) => ca[i]! * amount + cb[i]! * (1 - amount)) as [number, number, number],
  );
}

function luminance(hex: string): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = parseHex(hex).map(channel) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** White or near-black, whichever reads better on `background`. */
export function readableText(background: string): string {
  return contrastRatio(background, '#ffffff') >= contrastRatio(background, '#14161c')
    ? '#ffffff'
    : '#14161c';
}

// ----- node appearance -----------------------------------------------------------------------

/** The branch colour for every node: first-level branches take theme colours in order. */
export function branchColors(snapshot: MapSnapshot, theme: Theme): Map<string, string> {
  const colors = new Map<string, string>();
  const firstLevel = [
    ...childrenOf(snapshot, ROOT_ID, 'right'),
    ...childrenOf(snapshot, ROOT_ID, 'left'),
  ];
  const paint = (id: string, color: string, seen: Set<string>) => {
    if (seen.has(id)) return;
    seen.add(id);
    colors.set(id, color);
    for (const child of snapshot.children.get(id) ?? []) paint(child, color, seen);
  };
  const seen = new Set<string>();
  firstLevel.forEach((node, i) => paint(node.id, theme.branches[i % theme.branches.length]!, seen));
  return colors;
}

export interface NodeAppearance {
  background: string;
  border: string;
  text: string;
  /** connector colour into this node */
  line: string;
  /** connector width into this node, in screen pixels */
  lineWidth: number;
}

const SURFACE: Record<ColorMode, string> = { light: '#ffffff', dark: '#1a2130' };
const INK: Record<ColorMode, string> = { light: '#1b2232', dark: '#e8ecf4' };

/**
 * How a node looks. Nodes with the automatic colour get a depth-based treatment from their
 * branch colour: first-level nodes are solid, second-level tinted, deeper ones outlined.
 */
const appearanceCache = new Map<string, NodeAppearance>();

export function nodeAppearance(
  color: string,
  shape: Shape,
  depth: number,
  branch: string,
  mode: ColorMode,
): NodeAppearance {
  // Only a few dozen combinations exist; cache them so big maps don't redo colour maths.
  const level = depth <= 1 ? 1 : Math.min(depth, 3);
  const key = `${color}|${shape}|${level}|${branch}|${mode}`;
  let look = appearanceCache.get(key);
  if (!look) {
    look = computeAppearance(color, shape, level, branch, mode);
    appearanceCache.set(key, look);
  }
  return look;
}

function computeAppearance(
  color: string,
  shape: Shape,
  depth: number,
  branch: string,
  mode: ColorMode,
): NodeAppearance {
  const surface = SURFACE[mode];
  const line = branch;
  const lineWidth = depth <= 1 ? 3.5 : depth === 2 ? 2.5 : 2;
  if (shape === 'underline') {
    return { background: 'transparent', border: branch, text: INK[mode], line, lineWidth };
  }
  if (color !== AUTO_COLOR) {
    const background = mode === 'dark' ? mix(color, surface, 0.22) : color;
    return {
      background,
      border: mix(branch, background, 0.55),
      text: mode === 'dark' ? INK.dark : readableText(color),
      line,
      lineWidth,
    };
  }
  if (depth <= 1) {
    return { background: branch, border: branch, text: readableText(branch), line, lineWidth };
  }
  if (depth === 2) {
    const background = mix(branch, surface, mode === 'dark' ? 0.24 : 0.13);
    return { background, border: mix(branch, surface, 0.7), text: INK[mode], line, lineWidth };
  }
  return {
    background: surface,
    border: mix(branch, surface, 0.45),
    text: INK[mode],
    line,
    lineWidth,
  };
}

export function rootAppearance(theme: Theme): { from: string; to: string; text: string } {
  return { from: theme.root[0], to: theme.root[1], text: readableText(theme.root[0]) };
}
