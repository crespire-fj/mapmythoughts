import {
  Circle,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleHelp,
  Lightbulb,
  Star,
  type LucideIcon,
} from 'lucide-react';
import type { Marker } from '../model/schema';

export interface MarkerInfo {
  label: string;
  Icon: LucideIcon;
  color: string;
  /** used where icons can't be drawn (SVG/PNG/Word export) */
  glyph: string;
}

export const MARKER_INFO: Record<Marker, MarkerInfo> = {
  done: { label: 'Done', Icon: CircleCheck, color: '#16a34a', glyph: '✓' },
  progress: { label: 'In progress', Icon: CircleDashed, color: '#d97706', glyph: '◐' },
  todo: { label: 'To do', Icon: Circle, color: '#64748b', glyph: '○' },
  important: { label: 'Important', Icon: CircleAlert, color: '#dc2626', glyph: '!' },
  question: { label: 'Question', Icon: CircleHelp, color: '#2563eb', glyph: '?' },
  idea: { label: 'Idea', Icon: Lightbulb, color: '#ca8a04', glyph: '✦' },
  star: { label: 'Star', Icon: Star, color: '#eab308', glyph: '★' },
};

export function MarkerIcon({
  marker,
  size = 16,
  decorative = false,
}: {
  marker: Marker;
  size?: number;
  /** true when a visible text label already names the marker */
  decorative?: boolean;
}) {
  const { Icon, color, label } = MARKER_INFO[marker];
  return (
    <Icon
      className="marker"
      size={size}
      color={color}
      strokeWidth={2.4}
      fill={marker === 'star' ? color : 'none'}
      {...(decorative ? { 'aria-hidden': true } : { 'aria-label': label, role: 'img' })}
    />
  );
}
