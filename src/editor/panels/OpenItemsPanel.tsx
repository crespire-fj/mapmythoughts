import { useEffect, useMemo, useState } from 'react';
import * as Y from 'yjs';
import { X } from 'lucide-react';
import { api, type Collection } from '../../maps/api';
import {
  ancestorsOf,
  readSnapshot,
  treeOrder,
  type Marker,
  type MapSnapshot,
} from '../../model/schema';
import { MARKER_INFO, MarkerIcon } from '../markers';
import { internalLink } from '../url';

/** Markers that mean something still needs doing or deciding. */
export const OPEN_MARKERS: readonly Marker[] = ['question', 'todo', 'progress', 'important'];

export interface OpenItem {
  mapId: string;
  mapTitle: string;
  nodeId: string;
  marker: Marker;
  text: string;
  note: string;
  /** ancestors' first lines, outermost first */
  path: string[];
}

const firstLine = (text: string) => text.split('\n')[0]!.trim() || 'Untitled';

export function openItems(snapshot: MapSnapshot, mapId: string): OpenItem[] {
  const items: OpenItem[] = [];
  for (const id of treeOrder(snapshot)) {
    const node = snapshot.nodes.get(id)!;
    if (!node.marker || !OPEN_MARKERS.includes(node.marker)) continue;
    items.push({
      mapId,
      mapTitle: snapshot.title,
      nodeId: id,
      marker: node.marker,
      text: node.text,
      note: node.note,
      path: ancestorsOf(snapshot, id)
        .reverse()
        .map((a) => firstLine(snapshot.nodes.get(a)?.text ?? '')),
    });
  }
  return items;
}

interface Props {
  mapId: string;
  snapshot: MapSnapshot;
  collection: Collection | null;
  onSelect: (nodeId: string) => void;
  onClose: () => void;
}

/** Everything marked as a question, to do, in progress or important, in this map or collection. */
export function OpenItemsPanel({ mapId, snapshot, collection, onSelect, onClose }: Props) {
  const [scope, setScope] = useState<'map' | 'collection'>('map');
  const [others, setOthers] = useState<OpenItem[] | null>(null);
  const [failed, setFailed] = useState(false);

  // The other maps in the collection are read once when that scope is chosen.
  useEffect(() => {
    if (scope !== 'collection' || !collection) return;
    let cancelled = false;
    setOthers(null);
    setFailed(false);
    api
      .list()
      .then((maps) =>
        Promise.all(
          maps
            .filter((m) => m.collectionId === collection.id && m.id !== mapId)
            .map(async (m) => {
              const data = await api.exportMap(m.id);
              const doc = new Y.Doc();
              Y.applyUpdate(doc, data.state);
              return openItems(readSnapshot(doc), m.id);
            }),
        ),
      )
      .then((lists) => !cancelled && setOthers(lists.flat()))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [scope, collection, mapId]);

  const here = useMemo(() => openItems(snapshot, mapId), [snapshot, mapId]);
  const items = scope === 'collection' ? [...here, ...(others ?? [])] : here;
  const loading = scope === 'collection' && others === null && !failed;

  return (
    <aside className="panel panel--right open-items" aria-label="Open items">
      <header className="panel__header">
        <h2>Open items</h2>
        <button className="icon-button" onClick={onClose} aria-label="Close open items">
          <X size={18} />
        </button>
      </header>
      {collection && (
        <div className="segmented" role="radiogroup" aria-label="Show open items from">
          <button
            role="radio"
            aria-checked={scope === 'map'}
            className={scope === 'map' ? 'is-active' : ''}
            onClick={() => setScope('map')}
          >
            This map
          </button>
          <button
            role="radio"
            aria-checked={scope === 'collection'}
            className={scope === 'collection' ? 'is-active' : ''}
            onClick={() => setScope('collection')}
          >
            All of {collection.name}
          </button>
        </div>
      )}
      <div className="panel__body open-items__body">
        {loading && <p className="panel__hint">Reading the other maps…</p>}
        {failed && <p className="panel__hint">Could not read the other maps in this collection.</p>}
        {!loading && !items.length && (
          <p className="panel__hint">
            Nothing open. Give a node the Question, To do, In progress or Important marker and it
            appears here.
          </p>
        )}
        {OPEN_MARKERS.map((marker) => {
          const group = items.filter((item) => item.marker === marker);
          if (!group.length) return null;
          return (
            <section key={marker} className="open-items__group">
              <h3>
                <MarkerIcon marker={marker} decorative />
                {MARKER_INFO[marker].label}
                <span className="open-items__count">{group.length}</span>
              </h3>
              <ul>
                {group.map((item) => (
                  <li key={`${item.mapId}:${item.nodeId}`}>
                    <button
                      className="open-items__item"
                      onClick={() =>
                        item.mapId === mapId
                          ? onSelect(item.nodeId)
                          : (window.location.hash = internalLink(item.mapId, item.nodeId))
                      }
                    >
                      <strong>{firstLine(item.text)}</strong>
                      {(item.mapId !== mapId || item.path.length > 0) && (
                        <span className="open-items__path">
                          {[
                            ...(item.mapId !== mapId ? [firstLine(item.mapTitle)] : []),
                            ...item.path,
                          ].join(' › ')}
                        </span>
                      )}
                      {item.note && <span className="open-items__note">{item.note}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </aside>
  );
}
