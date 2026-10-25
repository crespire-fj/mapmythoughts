import { memo, useLayoutEffect, useRef } from 'react';
import { Link2, StickyNote, Waypoints } from 'lucide-react';
import type { Box } from '../layout/layout';
import type { Marker, Shape } from '../model/schema';
import { MarkerIcon } from './markers';
import { parseInternalLink } from './url';

export type EditMode = 'selectAll' | 'end';

export interface NodeViewProps {
  id: string;
  isRoot: boolean;
  text: string;
  shape: Shape;
  /** CSS colours; plain strings so unchanged nodes skip re-rendering */
  background: string;
  border: string;
  textColor: string;
  accent: string;
  glow?: string;
  marker: Marker | null;
  hasNote: boolean;
  /** the note, when notes are shown on the map; '' otherwise */
  visibleNote: string;
  link: string;
  box: Box;
  depth: number;
  selected: boolean;
  primary: boolean;
  match: 'none' | 'match' | 'current';
  editMode: EditMode | null;
  hasChildren: boolean;
  collapsed: boolean;
  ghost?: boolean;
  /** faded during a presentation step that is about another branch */
  dimmed?: boolean;
  onSize: (id: string, width: number, height: number) => void;
  onPointerDown: (id: string, event: React.PointerEvent<HTMLDivElement>) => void;
  onDoubleClick: (id: string) => void;
  onTextChange: (id: string, text: string) => void;
  onEditEnd: (id: string) => void;
  onOpenDetails: (id: string) => void;
  /** pointer over (rect) or off (null) the note badge, for the note preview */
  onNoteHover: (id: string, rect: DOMRect | null) => void;
}

/** Reads the editable's text, normalising the line breaks browsers insert. */
function readText(element: HTMLElement): string {
  return element.innerText.replace(/\u00a0/g, ' ').replace(/\n$/, '');
}

function insertLineBreak() {
  // execCommand keeps the browser's own caret handling and native undo inside the editor.
  document.execCommand('insertText', false, '\n');
}

export const NodeView = memo(function NodeView(props: NodeViewProps) {
  const {
    id,
    isRoot,
    text,
    shape,
    background,
    border,
    textColor,
    accent,
    glow,
    marker,
    hasNote,
    visibleNote,
    link,
    box,
    depth,
    selected,
    primary,
    match,
    editMode,
    hasChildren,
    collapsed,
    ghost,
    dimmed,
    onSize,
  } = props;
  const outerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const editing = editMode !== null;

  // Report size before paint and whenever content reflows, so layout never shows stale positions.
  useLayoutEffect(() => {
    const element = outerRef.current;
    if (!element || ghost) return;
    const measure = () => onSize(id, element.offsetWidth, element.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [id, onSize, ghost]);

  // Enter edit mode: seed the editable with the current text, focus it, place the caret.
  useLayoutEffect(() => {
    const element = editorRef.current;
    if (!editMode || !element) return;
    element.textContent = text;
    element.focus({ preventScroll: true });
    const range = document.createRange();
    range.selectNodeContents(element);
    if (editMode === 'end') range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    // Only on entering edit mode; while editing the DOM is the source of truth.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editMode]);

  const className = [
    'node',
    isRoot ? 'node--root' : `node--${shape} node--depth-${Math.min(depth, 3)}`,
    selected && 'is-selected',
    primary && 'is-primary',
    editing && 'is-editing',
    ghost && 'is-ghost',
    dimmed && 'is-dimmed',
    match !== 'none' && `is-${match === 'current' ? 'current-match' : 'match'}`,
    !text && !editing && 'is-empty',
    visibleNote && 'has-note-text',
  ]
    .filter(Boolean)
    .join(' ');

  const style: React.CSSProperties & Record<string, string> = {
    transform: `translate(${box.x}px, ${box.y}px)`,
  };
  style['--node-bg'] = background;
  style['--node-border'] = border;
  style['--node-text'] = textColor;
  style['--node-accent'] = accent;
  if (glow) style['--node-glow'] = glow;

  return (
    <div
      ref={outerRef}
      className={className}
      style={style}
      data-node-id={id}
      role="treeitem"
      aria-level={depth + 1}
      aria-selected={selected}
      aria-expanded={hasChildren ? !collapsed : undefined}
      aria-label={text || (isRoot ? 'Untitled map' : 'Empty node')}
      onPointerDown={(event) => props.onPointerDown(id, event)}
      onDoubleClick={() => props.onDoubleClick(id)}
    >
      {marker && <MarkerIcon marker={marker} />}
      {editing ? (
        <div
          ref={editorRef}
          className="node__editor"
          contentEditable="plaintext-only"
          suppressContentEditableWarning
          spellCheck
          onInput={(event) => props.onTextChange(id, readText(event.currentTarget))}
          onKeyDown={(event) => {
            // Plain Enter adds a sibling (handled globally); Shift/Ctrl/⌘+Enter add a line break.
            if (event.key === 'Enter' && (event.shiftKey || event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              insertLineBreak();
            }
          }}
          onBlur={() => props.onEditEnd(id)}
        />
      ) : (
        <div className="node__text">{text || (isRoot ? 'Untitled map' : '\u200b')}</div>
      )}
      {(hasNote || link) && !ghost && (
        <span className="node__badges">
          {hasNote && (
            <button
              type="button"
              className="node__badge"
              aria-label="Show note"
              onPointerDown={(event) => event.stopPropagation()}
              onPointerEnter={(event) =>
                props.onNoteHover(id, event.currentTarget.getBoundingClientRect())
              }
              onPointerLeave={() => props.onNoteHover(id, null)}
              onFocus={(event) =>
                props.onNoteHover(id, event.currentTarget.getBoundingClientRect())
              }
              onBlur={() => props.onNoteHover(id, null)}
              onClick={(event) => {
                event.stopPropagation();
                props.onOpenDetails(id);
              }}
            >
              <StickyNote size={13} />
            </button>
          )}
          {link &&
            (parseInternalLink(link) ? (
              // a link inside this app: follow it in the same tab
              <a
                className="node__badge node__badge--internal"
                href={link}
                aria-label={
                  parseInternalLink(link)!.nodeId ? 'Go to linked node' : 'Go to linked map'
                }
                title={parseInternalLink(link)!.nodeId ? 'Go to linked node' : 'Go to linked map'}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
              >
                <Waypoints size={13} />
              </a>
            ) : (
              <a
                className="node__badge"
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Open link ${link}`}
                title={link}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
              >
                <Link2 size={13} />
              </a>
            ))}
        </span>
      )}
      {visibleNote && !ghost && <div className="node__note">{visibleNote}</div>}
    </div>
  );
});
