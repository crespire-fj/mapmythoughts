import { Ban, Focus, NotebookPen, Spline } from 'lucide-react';
import {
  AUTO_COLOR,
  COLORS,
  MARKERS,
  SHAPES,
  type Marker,
  type NodeSnapshot,
  type Shape,
} from '../model/schema';
import { keepFocus } from '../ui/Menu';
import { MARKER_INFO, MarkerIcon } from './markers';

interface Props {
  nodes: NodeSnapshot[];
  autoPreview: string;
  onShape: (shape: Shape) => void;
  onColor: (color: string) => void;
  onMarker: (marker: Marker | null) => void;
  onDetails: () => void;
  onLink: () => void;
  onFocus: () => void;
  /** two nodes are selected, so the link button links them directly */
  canLinkPair: boolean;
}

const SHAPE_LABEL: Record<Shape, string> = {
  rounded: 'Rounded',
  pill: 'Pill',
  rect: 'Square',
  underline: 'Underline',
};

/** Floating style controls for the selected node(s). */
export function StyleBar(props: Props) {
  const { nodes, autoPreview, onShape, onColor, onMarker, onDetails } = props;
  const all = <T,>(read: (n: NodeSnapshot) => T) =>
    nodes.every((n) => read(n) === read(nodes[0]!)) ? read(nodes[0]!) : undefined;
  const shape = all((n) => n.shape);
  const color = all((n) => n.color);
  const marker = all((n) => n.marker);

  return (
    <div className="stylebar" role="toolbar" aria-label="Node style">
      <div className="stylebar__group" role="radiogroup" aria-label="Shape">
        {SHAPES.map((value) => (
          <button
            key={value}
            role="radio"
            aria-checked={shape === value}
            className={`stylebar__shape stylebar__shape--${value}${shape === value ? ' is-active' : ''}`}
            aria-label={`${SHAPE_LABEL[value]} shape`}
            title={`${SHAPE_LABEL[value]} shape`}
            onMouseDown={keepFocus}
            onClick={() => onShape(value)}
          />
        ))}
      </div>
      <span className="stylebar__divider" />
      <div className="stylebar__group" role="radiogroup" aria-label="Colour">
        {COLORS.map((value) => (
          <button
            key={value}
            role="radio"
            aria-checked={color === value}
            className={`stylebar__swatch${color === value ? ' is-active' : ''}${value === AUTO_COLOR ? ' stylebar__swatch--auto' : ''}`}
            style={{ background: value === AUTO_COLOR ? autoPreview : value }}
            aria-label={value === AUTO_COLOR ? 'Theme colour' : `Colour ${value}`}
            title={value === AUTO_COLOR ? 'Theme colour (follows the branch)' : value}
            onMouseDown={keepFocus}
            onClick={() => onColor(value)}
          />
        ))}
      </div>
      <span className="stylebar__divider" />
      <div className="stylebar__group" role="radiogroup" aria-label="Marker">
        <button
          role="radio"
          aria-checked={marker === null}
          className={`icon-button${marker === null ? ' is-active' : ''}`}
          aria-label="No marker"
          title="No marker"
          onMouseDown={keepFocus}
          onClick={() => onMarker(null)}
        >
          <Ban size={15} />
        </button>
        {MARKERS.map((value: Marker) => (
          <button
            key={value}
            role="radio"
            aria-checked={marker === value}
            className={`icon-button${marker === value ? ' is-active' : ''}`}
            aria-label={`${MARKER_INFO[value].label} marker`}
            title={MARKER_INFO[value].label}
            onMouseDown={keepFocus}
            onClick={() => onMarker(value)}
          >
            <MarkerIcon marker={value} />
          </button>
        ))}
      </div>
      <span className="stylebar__divider" />
      <button
        className="icon-button"
        aria-label={props.canLinkPair ? 'Link these two nodes' : 'Link to another node'}
        title={props.canLinkPair ? 'Link these two nodes (⌥L)' : 'Link to another node (⌥L)'}
        onMouseDown={keepFocus}
        onClick={props.onLink}
      >
        <Spline size={16} />
      </button>
      <button
        className="icon-button"
        aria-label="Focus on this branch"
        title="Focus on this branch (⌥F)"
        onMouseDown={keepFocus}
        onClick={props.onFocus}
      >
        <Focus size={16} />
      </button>

      <button
        className="icon-button"
        aria-label="Notes and link"
        title="Notes and link (⌘I)"
        onMouseDown={keepFocus}
        onClick={onDetails}
      >
        <NotebookPen size={16} />
      </button>
    </div>
  );
}
