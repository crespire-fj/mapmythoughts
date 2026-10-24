import { useSyncExternalStore } from 'react';
import { MapEditorPage } from './editor/MapEditor';
import { Guide } from './guide/Guide';
import { Home } from './maps/Home';
import type { HomeView } from './maps/Sidebar';

// Hash routes: #/ all maps, #/unsorted, #/collection/<id>, #/map/<id> for the editor,
// #/guide or #/guide/<section> for the feature guide.
const subscribe = (callback: () => void) => {
  window.addEventListener('hashchange', callback);
  return () => window.removeEventListener('hashchange', callback);
};
const getHash = () => window.location.hash;

export function hashFor(view: HomeView): string {
  if (view.kind === 'collection') return `#/collection/${view.id}`;
  return view.kind === 'unsorted' ? '#/unsorted' : '#/';
}

function viewFrom(hash: string): HomeView {
  const collection = /^#\/collection\/([\w-]+)$/.exec(hash)?.[1];
  if (collection) return { kind: 'collection', id: collection };
  return hash === '#/unsorted' ? { kind: 'unsorted' } : { kind: 'all' };
}

export function App() {
  const hash = useSyncExternalStore(subscribe, getHash);
  const mapId = /^#\/map\/([\w-]+)$/.exec(hash)?.[1];
  const guide = /^#\/guide(?:\/([\w-]+))?$/.exec(hash);

  if (guide) {
    return <Guide section={guide[1] ?? null} onExit={() => (window.location.hash = '#/')} />;
  }

  if (mapId) {
    return (
      <MapEditorPage
        mapId={mapId}
        onExit={(collectionId) =>
          (window.location.hash = hashFor(
            collectionId ? { kind: 'collection', id: collectionId } : { kind: 'all' },
          ))
        }
      />
    );
  }
  return (
    <Home
      view={viewFrom(hash)}
      onNavigate={(view) => (window.location.hash = hashFor(view))}
      onOpen={(id) => (window.location.hash = `#/map/${id}`)}
    />
  );
}
