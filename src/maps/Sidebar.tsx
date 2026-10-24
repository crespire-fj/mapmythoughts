import { useRef, useState } from 'react';
import { FolderOpen, Inbox, LayoutGrid, Plus } from 'lucide-react';
import { COLLECTION_COLORS, type Collection } from './api';
import { MAP_DRAG_TYPE } from './MapCard';

export type HomeView = { kind: 'all' } | { kind: 'unsorted' } | { kind: 'collection'; id: string };

interface Props {
  view: HomeView;
  collections: Collection[];
  totalMaps: number;
  unsortedMaps: number;
  onNavigate: (view: HomeView) => void;
  onCreate: (name: string, color: string) => Promise<string | null>;
  /** drop a dragged map card onto a collection (or onto "Not in a collection") */
  onDropMap: (mapId: string, collectionId: string | null) => void;
}

/** Navigation between all maps, unsorted maps and collections; collections accept dropped maps. */
export function Sidebar(props: Props) {
  const { view, collections } = props;
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const nextColor = COLLECTION_COLORS[collections.length % COLLECTION_COLORS.length]!;
  // Enter submits and then the input's blur fires too; only the first one may create.
  const submitting = useRef(false);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setCreating(false);
      return;
    }
    if (submitting.current) return;
    submitting.current = true;
    try {
      const problem = await props.onCreate(trimmed, nextColor);
      if (problem) setError(problem);
      else {
        setName('');
        setCreating(false);
        setError(null);
      }
    } finally {
      submitting.current = false;
    }
  };

  /** Drop-target handlers for an item that maps can be moved into. */
  const dropProps = (key: string, collectionId: string | null) => ({
    onDragOver: (event: React.DragEvent) => {
      if (!event.dataTransfer.types.includes(MAP_DRAG_TYPE)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      setDropTarget(key);
    },
    onDragLeave: () => setDropTarget((current) => (current === key ? null : current)),
    onDrop: (event: React.DragEvent) => {
      const mapId = event.dataTransfer.getData(MAP_DRAG_TYPE);
      setDropTarget(null);
      if (mapId) {
        event.preventDefault();
        props.onDropMap(mapId, collectionId);
      }
    },
  });

  const item = (key: string, active: boolean) =>
    `sidebar__item${active ? ' is-active' : ''}${dropTarget === key ? ' is-drop-target' : ''}`;

  return (
    <nav className="sidebar" aria-label="Collections">
      <button
        className={item('all', view.kind === 'all')}
        aria-current={view.kind === 'all' ? 'page' : undefined}
        onClick={() => props.onNavigate({ kind: 'all' })}
      >
        <LayoutGrid size={17} />
        <span className="sidebar__name">All maps</span>
        <span className="sidebar__count">{props.totalMaps}</span>
      </button>
      <button
        className={item('unsorted', view.kind === 'unsorted')}
        aria-current={view.kind === 'unsorted' ? 'page' : undefined}
        onClick={() => props.onNavigate({ kind: 'unsorted' })}
        title="Maps that aren't in a collection. Drop a map here to take it out of its collection."
        {...dropProps('unsorted', null)}
      >
        <Inbox size={17} />
        <span className="sidebar__name">Not in a collection</span>
        <span className="sidebar__count">{props.unsortedMaps}</span>
      </button>

      <div className="sidebar__heading">
        <span>Collections</span>
        <button
          className="icon-button"
          aria-label="New collection"
          title="New collection"
          onClick={() => {
            setCreating(true);
            setError(null);
          }}
        >
          <Plus size={16} />
        </button>
      </div>

      {collections.map((collection) => (
        <button
          key={collection.id}
          className={item(collection.id, view.kind === 'collection' && view.id === collection.id)}
          aria-current={
            view.kind === 'collection' && view.id === collection.id ? 'page' : undefined
          }
          onClick={() => props.onNavigate({ kind: 'collection', id: collection.id })}
          {...dropProps(collection.id, collection.id)}
        >
          <span className="sidebar__dot" style={{ background: collection.color }} />
          <span className="sidebar__name">{collection.name}</span>
          <span className="sidebar__count">{collection.mapCount}</span>
        </button>
      ))}

      {creating ? (
        <form
          className="sidebar__new"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <span className="sidebar__dot" style={{ background: nextColor }} />
          <input
            autoFocus
            className="sidebar__input"
            placeholder="Collection name, e.g. FEMS"
            aria-label="New collection name"
            value={name}
            maxLength={80}
            onChange={(event) => {
              setName(event.target.value);
              setError(null);
            }}
            onBlur={() => void submit()}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                setCreating(false);
                setName('');
              }
            }}
          />
        </form>
      ) : (
        collections.length === 0 && (
          <button className="sidebar__hint" onClick={() => setCreating(true)}>
            <FolderOpen size={16} />
            Group related maps, e.g. one collection per project.
          </button>
        )
      )}
      {error && (
        <p className="sidebar__error" role="alert">
          {error}
        </p>
      )}
    </nav>
  );
}
