import type { ThemeId } from '../model/schema';
import { useColorMode } from '../theme/colorMode';
import { THEMES } from '../theme/themes';

/** Deterministic pseudo-random numbers from a string, so each card's artwork stays the same. */
function seededRandoms(seed: string, count: number): number[] {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const values: number[] = [];
  for (let i = 0; i < count; i++) {
    h = (h * 1103515245 + 12345) >>> 0;
    values.push(h / 2 ** 32);
  }
  return values;
}

/** Decorative artwork for a card: a little map in the theme's colours, varied by a seed. */
export function Artwork({
  theme,
  seed,
  branches = 6,
}: {
  theme: ThemeId;
  seed: string;
  branches?: number;
}) {
  const t = THEMES[theme] ?? THEMES.lagoon;
  const { mode } = useColorMode();
  const count = Math.max(3, Math.min(branches, 8));
  const r = seededRandoms(seed, count * 3);
  const rows = Math.ceil(count / 2);
  const nodes = Array.from({ length: count }, (_, i) => {
    const side = i % 2 === 0 ? 1 : -1;
    const row = Math.floor(i / 2);
    const y = 60 + (row - (rows - 1) / 2) * (88 / Math.max(rows, 1)) + (r[i * 3]! - 0.5) * 8;
    return {
      x: 160 + side * (78 + r[i * 3 + 1]! * 18),
      y,
      twig: (r[i * 3 + 2]! - 0.5) * 18,
      color: t.branches[i % t.branches.length]!,
      side,
    };
  });
  return (
    <svg
      className="card__art"
      viewBox="0 0 320 120"
      aria-hidden="true"
      preserveAspectRatio="xMidYMid slice"
    >
      <rect width="320" height="120" fill={t.canvas[mode]} />
      {nodes.map((node, i) => (
        <g key={i}>
          <path
            d={`M ${160 + node.side * 30} 60 C ${160 + node.side * 55} 60, ${node.x - node.side * 30} ${node.y}, ${node.x - node.side * 18} ${node.y}`}
            stroke={node.color}
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
          />
          <rect x={node.x - 18} y={node.y - 7} width="36" height="14" rx="7" fill={node.color} />
          <path
            d={`M ${node.x + node.side * 18} ${node.y} q ${node.side * 14} 0 ${node.side * 24} ${node.twig}`}
            stroke={node.color}
            strokeWidth="2"
            fill="none"
            opacity="0.55"
          />
        </g>
      ))}
      <defs>
        <linearGradient id={`g-${seed}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={t.root[0]} />
          <stop offset="1" stopColor={t.root[1]} />
        </linearGradient>
      </defs>
      <rect x="128" y="48" width="64" height="24" rx="12" fill={`url(#g-${seed})`} />
    </svg>
  );
}
