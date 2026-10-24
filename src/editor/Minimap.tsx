import { memo, useRef } from 'react';
import { Map as MapIcon, Maximize, Minus, Plus } from 'lucide-react';
import { layoutBounds, type LayoutResult } from '../layout/layout';
import { keepFocus } from '../ui/Menu';
import type { Viewport } from './viewport';

const WIDTH = 200;
const HEIGHT = 128;
const PAD = 8;

interface Props {
  layout: LayoutResult;
  colors: Map<string, string>;
  rootColor: string;
  viewport: Viewport;
  canvas: { width: number; height: number };
  visible: boolean;
  onToggle: () => void;
  onCenter: (x: number, y: number, animate: boolean) => void;
  onZoom: (factor: number) => void;
  onFit: () => void;
}

/** The map's boxes in world coordinates; redrawn only when the layout or colours change. */
const MapShapes = memo(function MapShapes({
  layout,
  colors,
  rootColor,
  minWidth,
  minHeight,
}: {
  layout: LayoutResult;
  colors: Map<string, string>;
  rootColor: string;
  minWidth: number;
  minHeight: number;
}) {
  return (
    <>
      {[...layout.nodes.values()].map((node) => (
        <rect
          key={node.id}
          x={node.box.x}
          y={node.box.y}
          width={Math.max(node.box.width, minWidth)}
          height={Math.max(node.box.height, minHeight)}
          rx={node.box.height / 4}
          fill={colors.get(node.id) ?? '#94a3b8'}
          opacity={node.depth <= 1 ? 0.95 : 0.6}
        />
      ))}
      <rect
        x={layout.root.x}
        y={layout.root.y}
        width={layout.root.width}
        height={layout.root.height}
        rx={layout.root.height / 2}
        fill={rootColor}
      />
    </>
  );
});

/** Overview of the whole map with the visible area outlined; click or drag to move around. */
export function Minimap(props: Props) {
  const { layout, colors, viewport, canvas, visible } = props;
  const svgRef = useRef<SVGSVGElement>(null);
  const view = {
    x: -viewport.x / viewport.scale,
    y: -viewport.y / viewport.scale,
    width: canvas.width / viewport.scale,
    height: canvas.height / viewport.scale,
  };
  // Include the visible area so its outline is always drawn, even when zoomed far out.
  const map = layoutBounds(layout);
  const minX = Math.min(map.x, view.x);
  const minY = Math.min(map.y, view.y);
  const bounds = {
    x: minX,
    y: minY,
    width: Math.max(map.x + map.width, view.x + view.width) - minX,
    height: Math.max(map.y + map.height, view.y + view.height) - minY,
  };
  const scale = Math.min((WIDTH - PAD * 2) / bounds.width, (HEIGHT - PAD * 2) / bounds.height);
  const offsetX = (WIDTH - bounds.width * scale) / 2 - bounds.x * scale;
  const offsetY = (HEIGHT - bounds.height * scale) / 2 - bounds.y * scale;
  const toMini = (x: number, y: number) => ({ x: x * scale + offsetX, y: y * scale + offsetY });

  const viewMini = toMini(view.x, view.y);

  const centerAt = (event: React.PointerEvent<SVGSVGElement>, animate: boolean) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const x = (event.clientX - rect.left - offsetX) / scale;
    const y = (event.clientY - rect.top - offsetY) / scale;
    props.onCenter(x, y, animate);
  };

  return (
    <div className="navigator">
      {visible && (
        <svg
          ref={svgRef}
          className="minimap"
          width={WIDTH}
          height={HEIGHT}
          role="img"
          aria-label="Map overview. Click to move the view."
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            centerAt(event, true);
          }}
          onPointerMove={(event) => {
            if (event.buttons) centerAt(event, false);
          }}
        >
          <g transform={`translate(${offsetX} ${offsetY}) scale(${scale})`}>
            <MapShapes
              layout={layout}
              colors={colors}
              rootColor={props.rootColor}
              minWidth={2 / scale}
              minHeight={1.5 / scale}
            />
          </g>
          <rect
            className="minimap__view"
            x={viewMini.x}
            y={viewMini.y}
            width={view.width * scale}
            height={view.height * scale}
            rx={3}
          />
        </svg>
      )}
      <div className="zoombar" role="toolbar" aria-label="Zoom">
        <button
          className="icon-button"
          onMouseDown={keepFocus}
          onClick={() => props.onZoom(1 / 1.2)}
          aria-label="Zoom out"
          title="Zoom out (⌘−)"
        >
          <Minus size={16} />
        </button>
        <span className="zoombar__value">{Math.round(viewport.scale * 100)}%</span>
        <button
          className="icon-button"
          onMouseDown={keepFocus}
          onClick={() => props.onZoom(1.2)}
          aria-label="Zoom in"
          title="Zoom in (⌘=)"
        >
          <Plus size={16} />
        </button>
        <button
          className="icon-button"
          onMouseDown={keepFocus}
          onClick={props.onFit}
          aria-label="Fit map"
          title="Fit map (⌘0)"
        >
          <Maximize size={16} />
        </button>
        <button
          className={`icon-button${visible ? ' is-active' : ''}`}
          onMouseDown={keepFocus}
          onClick={props.onToggle}
          aria-label={visible ? 'Hide overview' : 'Show overview'}
          aria-pressed={visible}
          title="Overview map"
        >
          <MapIcon size={16} />
        </button>
      </div>
    </div>
  );
}
