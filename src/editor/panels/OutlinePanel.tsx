import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, X } from 'lucide-react';
import { ROOT_ID, childrenOf, type MapSnapshot } from '../../model/schema';
import { MarkerIcon } from '../markers';

interface Props {
  snapshot: MapSnapshot;
  selection: ReadonlySet<string>;
  primary: string | null;
  branchColors: Map<string, string>;
  onSelect: (id: string) => void;
  onRename: (id: string, text: string) => void;
  onToggle: (id: string) => void;
  onClose: () => void;
}

interface Row {
  id: string;
  depth: number;
}

function visibleRows(snapshot: MapSnapshot): Row[] {
  const rows: Row[] = [{ id: ROOT_ID, depth: 0 }];
  const visit = (ids: string[], depth: number) => {
    for (const id of ids) {
      rows.push({ id, depth });
      if (!snapshot.nodes.get(id)?.collapsed) visit(snapshot.children.get(id) ?? [], depth + 1);
    }
  };
  visit(
    [...childrenOf(snapshot, ROOT_ID, 'right'), ...childrenOf(snapshot, ROOT_ID, 'left')].map(
      (n) => n.id,
    ),
    1,
  );
  return rows;
}

/**
 * The map as an indented list. Arrow keys move, Enter renames, Space or ←/→ collapse and expand.
 * Selecting a row selects the node on the canvas.
 */
export function OutlinePanel(props: Props) {
  const { snapshot, selection, primary } = props;
  const rows = visibleRows(snapshot);
  const [renaming, setRenaming] = useState<string | null>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Keep the primary selection's row in view.
  useEffect(() => {
    if (!primary) return;
    listRef.current
      ?.querySelector(`[data-row="${CSS.escape(primary)}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [primary]);

  const focusRow = (id: string) => {
    props.onSelect(id);
    requestAnimationFrame(() =>
      listRef.current?.querySelector<HTMLElement>(`[data-row="${CSS.escape(id)}"]`)?.focus(),
    );
  };

  const onKeyDown = (event: React.KeyboardEvent, index: number, id: string) => {
    if (renaming) return;
    const node = snapshot.nodes.get(id);
    const hasChildren = (snapshot.children.get(id)?.length ?? 0) > 0;
    switch (event.key) {
      case 'ArrowDown':
        if (rows[index + 1]) focusRow(rows[index + 1]!.id);
        break;
      case 'ArrowUp':
        if (rows[index - 1]) focusRow(rows[index - 1]!.id);
        break;
      case 'ArrowRight':
        if (hasChildren && node?.collapsed) props.onToggle(id);
        else if (rows[index + 1]?.depth === rows[index]!.depth + 1) focusRow(rows[index + 1]!.id);
        break;
      case 'ArrowLeft':
        if (hasChildren && !node?.collapsed && id !== ROOT_ID) props.onToggle(id);
        else {
          for (let i = index - 1; i >= 0; i--) {
            if (rows[i]!.depth < rows[index]!.depth) {
              focusRow(rows[i]!.id);
              break;
            }
          }
        }
        break;
      case ' ':
        if (hasChildren && id !== ROOT_ID) props.onToggle(id);
        break;
      case 'Enter':
      case 'F2':
        setRenaming(id);
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  return (
    <aside className="panel panel--left" aria-label="Outline">
      <header className="panel__header">
        <h2>Outline</h2>
        <button className="icon-button" onClick={props.onClose} aria-label="Close outline">
          <X size={18} />
        </button>
      </header>
      <ul className="outline" role="tree" aria-label="Outline" ref={listRef}>
        {rows.map((row, index) => {
          const isRoot = row.id === ROOT_ID;
          const node = snapshot.nodes.get(row.id);
          const text = isRoot ? snapshot.title : (node?.text ?? '');
          const hasChildren = (snapshot.children.get(row.id)?.length ?? 0) > 0;
          const color = props.branchColors.get(row.id);
          return (
            <li
              key={row.id}
              data-row={row.id}
              role="treeitem"
              aria-level={row.depth + 1}
              aria-selected={selection.has(row.id)}
              aria-expanded={hasChildren && !isRoot ? !node?.collapsed : undefined}
              tabIndex={row.id === (primary ?? ROOT_ID) ? 0 : -1}
              className={`outline__row${selection.has(row.id) ? ' is-selected' : ''}${isRoot ? ' outline__row--root' : ''}`}
              style={{ paddingLeft: 10 + row.depth * 16 }}
              onClick={() => props.onSelect(row.id)}
              onDoubleClick={() => setRenaming(row.id)}
              onKeyDown={(event) => onKeyDown(event, index, row.id)}
            >
              <span className="outline__toggle">
                {hasChildren && !isRoot && (
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label={node?.collapsed ? 'Expand' : 'Collapse'}
                    onClick={(event) => {
                      event.stopPropagation();
                      props.onToggle(row.id);
                    }}
                  >
                    {node?.collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                  </button>
                )}
              </span>
              {color && <span className="outline__dot" style={{ background: color }} />}
              {node?.marker && <MarkerIcon marker={node.marker} size={14} />}
              {renaming === row.id ? (
                <input
                  className="outline__input"
                  defaultValue={text}
                  autoFocus
                  onFocus={(event) => event.currentTarget.select()}
                  onKeyDown={(event) => {
                    event.stopPropagation();
                    if (event.key === 'Enter') {
                      props.onRename(row.id, event.currentTarget.value);
                      setRenaming(null);
                      focusRow(row.id);
                    } else if (event.key === 'Escape') {
                      setRenaming(null);
                      focusRow(row.id);
                    }
                  }}
                  onBlur={(event) => {
                    if (renaming === row.id) props.onRename(row.id, event.currentTarget.value);
                    setRenaming(null);
                  }}
                />
              ) : (
                <span className="outline__text">
                  {text.split('\n')[0] || (isRoot ? 'Untitled map' : 'Empty')}
                </span>
              )}
              {!isRoot && node?.collapsed && hasChildren && (
                <span className="outline__count">{snapshot.children.get(row.id)!.length}</span>
              )}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
