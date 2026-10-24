import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  FileDown,
  Monitor,
  Moon,
  Palette,
  Pencil,
  Plus,
  Search,
  Sun,
  Trash2,
  Upload,
} from 'lucide-react';
import { buildMapDoc } from '../commands/commands';
import {
  FILE_EXTENSION,
  MapFileError,
  buildMapFile,
  isMapFile,
  parseMapFile,
} from '../export/mapfile';
import { download, safeFilename } from '../export/image';
import { parseMarkdown } from '../export/markdown';
import { useColorMode } from '../theme/colorMode';
import { Wordmark } from '../ui/Brand';
import { Dialog } from '../ui/Dialog';
import { Menu, MenuSection } from '../ui/Menu';
import { ApiError, COLLECTION_COLORS, api, type Collection, type MapSummary } from './api';
import { Artwork } from './Artwork';
import { ago } from './format';
import { MapCard } from './MapCard';
import { Sidebar, type HomeView } from './Sidebar';
import { TEMPLATES, type Template } from './templates';

interface Props {
  view: HomeView;
  onNavigate: (view: HomeView) => void;
  onOpen: (id: string) => void;
}

export function Home({ view, onNavigate, onOpen }: Props) {
  const [maps, setMaps] = useState<MapSummary[] | null>(null);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const { preference, cycle } = useColorMode();
  const ColorIcon = preference === 'dark' ? Moon : preference === 'light' ? Sun : Monitor;

  const load = useCallback(() => {
    Promise.all([api.list(), api.collections.list()])
      .then(([mapList, collectionList]) => {
        setMaps(mapList);
        setCollections(collectionList);
        setError(null);
      })
      .catch(() => setError('Could not reach the Map My Thoughts server. Is Docker running?'));
  }, []);
  useEffect(load, [load]);

  const current =
    view.kind === 'collection' ? collections.find((c) => c.id === view.id) : undefined;
  const missingCollection = view.kind === 'collection' && maps !== null && !current;
  const targetCollection = current?.id ?? null;

  const inView = useMemo(() => {
    const all = maps ?? [];
    if (view.kind === 'unsorted') return all.filter((m) => !m.collectionId);
    if (view.kind === 'collection') return all.filter((m) => m.collectionId === view.id);
    return all;
  }, [maps, view]);

  const visible = useMemo(() => {
    const words = filter.toLowerCase().split(/\s+/).filter(Boolean);
    return inView.filter((m) => words.every((w) => m.title.toLowerCase().includes(w)));
  }, [inView, filter]);

  const create = async (
    template:
      Template | { title: string; outline: Template['outline']; settings?: Template['settings'] },
  ) => {
    setBusy(true);
    try {
      const doc = buildMapDoc(template.title, template.outline, template.settings);
      onOpen(await api.create(doc, targetCollection));
    } catch {
      setError('Could not create the map.');
    } finally {
      setBusy(false);
    }
  };

  /** Writes maps (with their collection names) to one .mmt file. */
  const exportMaps = async (list: MapSummary[], name: string) => {
    try {
      const entries = await Promise.all(
        list.map(async (map) => {
          const data = await api.exportMap(map.id);
          const c = collections.find((x) => x.id === map.collectionId);
          return {
            title: data.title,
            state: data.state,
            thumbnail: data.thumbnail,
            collection: c ? { name: c.name, color: c.color } : null,
          };
        }),
      );
      download(
        new Blob([buildMapFile(entries)], { type: 'application/json' }),
        `${safeFilename(name)}${FILE_EXTENSION}`,
      );
    } catch {
      setError('Could not export.');
    }
  };

  /**
   * Imports a .mmt file (or an .eqapmap file from before the rename). Maps go into the collection being viewed; otherwise into the
   * collection they came from (matched by name, created if it doesn't exist here).
   */
  const importMapFile = async (text: string) => {
    const parsed = parseMapFile(text);
    let known = await api.collections.list();
    const ids: string[] = [];
    for (const map of parsed) {
      let collectionId = targetCollection;
      if (!collectionId && map.collection) {
        const wanted = map.collection.name.toLowerCase();
        let match = known.find((c) => c.name.toLowerCase() === wanted);
        if (!match) {
          match = await api.collections.create(map.collection.name, map.collection.color);
          known = [...known, match];
        }
        collectionId = match.id;
      }
      ids.push(await api.create(map.state, collectionId, map.thumbnail));
    }
    return { ids, collections: new Set(parsed.map((m) => m.collection?.name).filter(Boolean)) };
  };

  const importFile = async (file: File) => {
    const text = await file.text();
    setError(null);
    setInfo(null);
    if (isMapFile(file.name, text)) {
      setBusy(true);
      try {
        const { ids } = await importMapFile(text);
        if (ids.length === 1) onOpen(ids[0]!);
        else {
          setInfo(`Imported ${ids.length} maps.`);
          load();
        }
      } catch (problem) {
        setError(problem instanceof MapFileError ? problem.message : 'Could not import that file.');
      } finally {
        setBusy(false);
      }
      return;
    }
    const { title, outline } = parseMarkdown(text);
    await create({ title, outline, settings: { theme: 'daydream' } });
  };

  const run = async (action: () => Promise<unknown>, failure: string) => {
    try {
      await action();
    } catch {
      setError(failure);
    }
    load();
  };

  const createCollection = async (name: string, color: string): Promise<string | null> => {
    try {
      const created = await api.collections.create(name, color);
      load();
      onNavigate({ kind: 'collection', id: created.id });
      return null;
    } catch (problem) {
      return problem instanceof ApiError ? problem.message : 'Could not create the collection.';
    }
  };

  const heading =
    view.kind === 'unsorted'
      ? 'Not in a collection'
      : view.kind === 'collection'
        ? (current?.name ?? 'Collection')
        : 'Your maps';

  return (
    <div className="home">
      <header className="home__bar">
        <Wordmark />
        <div className="home__bar-actions">
          <a
            className="button button--ghost"
            href="#/guide"
            title="Everything Map My Thoughts can do"
          >
            <BookOpen size={16} />
            Guide
          </a>
          <button
            className="button"
            disabled={busy}
            onClick={() => fileInput.current?.click()}
            title="Import a shared .mmt file or a Markdown outline"
          >
            <Upload size={16} />
            {current ? `Import into ${current.name}` : 'Import'}
          </button>
          <button
            className="icon-button"
            onClick={cycle}
            aria-label={`Colour mode: ${preference}`}
            title={`Colour mode: ${preference}`}
          >
            <ColorIcon size={18} />
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".mmt,.eqapmap,.json,.md,.markdown,.txt,application/json,text/markdown,text/plain"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void importFile(file);
            }}
          />
        </div>
      </header>

      <div className="home__layout">
        <Sidebar
          view={view}
          collections={collections}
          totalMaps={maps?.length ?? 0}
          unsortedMaps={(maps ?? []).filter((m) => !m.collectionId).length}
          onNavigate={(next) => {
            setFilter('');
            setRenaming(false);
            onNavigate(next);
          }}
          onCreate={createCollection}
          onDropMap={(mapId, collectionId) =>
            void run(() => api.move(mapId, collectionId), 'Could not move the map.')
          }
        />

        <main className="home__main">
          {view.kind === 'all' ? (
            <section className="hero">
              <h1>Think it through, beautifully.</h1>
              <p>
                Build maps at the speed of thought: Tab for a child, Enter for a sibling, arrows to
                move. Group them into collections, one per project.
              </p>
            </section>
          ) : current ? (
            <header className="collection-head">
              <span className="collection-head__badge" style={{ background: current.color }}>
                {current.name.slice(0, 1).toUpperCase()}
              </span>
              <div className="collection-head__text">
                {renaming ? (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      const input = event.currentTarget.elements.namedItem(
                        'name',
                      ) as HTMLInputElement;
                      const name = input.value.trim();
                      setRenaming(false);
                      if (name && name !== current.name) {
                        void run(
                          () => api.collections.update(current.id, { name }),
                          'Could not rename: that name may already be taken.',
                        );
                      }
                    }}
                  >
                    <input
                      name="name"
                      className="collection-head__input"
                      defaultValue={current.name}
                      aria-label="Collection name"
                      maxLength={80}
                      autoFocus
                      onFocus={(event) => event.currentTarget.select()}
                      onBlur={(event) => event.currentTarget.form?.requestSubmit()}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') setRenaming(false);
                      }}
                    />
                  </form>
                ) : (
                  <h1>{current.name}</h1>
                )}
                <p>
                  {current.mapCount} map{current.mapCount === 1 ? '' : 's'} · updated{' '}
                  {ago(current.updatedAt)}
                </p>
              </div>
              <div className="collection-head__actions">
                <button className="button" onClick={() => setRenaming(true)}>
                  <Pencil size={15} /> Rename
                </button>
                <button
                  className="icon-button"
                  aria-label="Export collection to share"
                  title="Export the whole collection as one .mmt file"
                  disabled={!current.mapCount}
                  onClick={() => void exportMaps(inView, current.name)}
                >
                  <FileDown size={18} />
                </button>
                <Menu label={<Palette size={18} />} title="Collection colour">
                  {(close) => (
                    <MenuSection title="Colour">
                      <div className="swatches">
                        {COLLECTION_COLORS.map((color) => (
                          <button
                            key={color}
                            className={`swatch${color === current.color ? ' is-active' : ''}`}
                            style={{ background: color }}
                            aria-label={`Colour ${color}`}
                            onClick={() => {
                              close();
                              void run(
                                () => api.collections.update(current.id, { color }),
                                'Could not change the colour.',
                              );
                            }}
                          />
                        ))}
                      </div>
                    </MenuSection>
                  )}
                </Menu>
                <button
                  className="icon-button icon-button--danger"
                  aria-label="Delete collection"
                  title="Delete collection"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 size={17} />
                </button>
              </div>
            </header>
          ) : (
            <header className="collection-head">
              <div className="collection-head__text">
                <h1>{missingCollection ? 'Collection not found' : heading}</h1>
                {view.kind === 'unsorted' && (
                  <p>Maps that aren't in any collection. Drag one onto a collection to file it.</p>
                )}
              </div>
            </header>
          )}

          {info && (
            <p className="notice notice--ok" role="status">
              {info}
            </p>
          )}
          {error && (
            <p className="notice" role="alert">
              {error}{' '}
              <button className="button button--ghost" onClick={load}>
                Retry
              </button>
            </p>
          )}

          {!missingCollection && (
            <section aria-labelledby="templates-heading">
              <h2 id="templates-heading" className="section-title">
                {current ? `Start a new map in ${current.name}` : 'Start something new'}
              </h2>
              <div className="templates">
                {TEMPLATES.map((template) => (
                  <button
                    key={template.id}
                    className="template"
                    disabled={busy}
                    onClick={() => void create(template)}
                    aria-label={template.id === 'blank' ? 'New map' : `New ${template.name}`}
                  >
                    <span className="template__art">
                      {template.id === 'blank' ? (
                        <span className="template__plus">
                          <Plus size={28} />
                        </span>
                      ) : (
                        <Artwork
                          theme={template.settings.theme ?? 'lagoon'}
                          seed={template.id}
                          branches={template.outline.length}
                        />
                      )}
                    </span>
                    <span className="template__name">{template.name}</span>
                    <span className="template__desc">{template.description}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {!missingCollection && (
            <section aria-labelledby="maps-heading">
              <div className="section-head">
                <h2 id="maps-heading" className="section-title">
                  {current ? `Maps in ${current.name}` : heading}
                </h2>
                {inView.length > 3 && (
                  <label className="filter">
                    <Search size={16} aria-hidden="true" />
                    <input
                      placeholder="Filter maps"
                      aria-label="Filter maps"
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                    />
                  </label>
                )}
              </div>
              {maps && inView.length === 0 && (
                <div className="empty">
                  <p>
                    {current
                      ? `No maps in ${current.name} yet. Start one above, or drag existing maps onto “${current.name}” in the sidebar.`
                      : view.kind === 'unsorted'
                        ? 'Every map is in a collection.'
                        : 'No maps yet. Pick a template above, or import a Markdown outline.'}
                  </p>
                </div>
              )}
              <ul className="cards">
                {visible.map((map) => (
                  <MapCard
                    key={map.id}
                    map={map}
                    collections={collections}
                    showCollection={view.kind === 'all'}
                    onOpen={() => onOpen(map.id)}
                    onMove={(collectionId) =>
                      void run(() => api.move(map.id, collectionId), 'Could not move the map.')
                    }
                    onDuplicate={() =>
                      void run(() => api.duplicate(map.id), 'Could not duplicate the map.')
                    }
                    onExport={() => void exportMaps([map], map.title || 'mind-map')}
                    onDelete={() => {
                      if (
                        window.confirm(
                          `Delete “${map.title || 'Untitled map'}”? This can't be undone.`,
                        )
                      ) {
                        void run(() => api.remove(map.id), 'Could not delete the map.');
                      }
                    }}
                  />
                ))}
              </ul>
            </section>
          )}
        </main>
      </div>

      {confirmDelete && current && (
        <Dialog
          title={`Delete “${current.name}”?`}
          onClose={() => setConfirmDelete(false)}
          actions={
            <>
              <button className="button" onClick={() => setConfirmDelete(false)}>
                Cancel
              </button>
              {current.mapCount > 0 && (
                <button
                  className="button button--danger"
                  onClick={() => {
                    setConfirmDelete(false);
                    void run(() => api.collections.remove(current.id, true), 'Could not delete.');
                    onNavigate({ kind: 'all' });
                  }}
                >
                  Delete it and its {current.mapCount} map{current.mapCount === 1 ? '' : 's'}
                </button>
              )}
              <button
                className="button button--primary"
                autoFocus
                onClick={() => {
                  setConfirmDelete(false);
                  void run(() => api.collections.remove(current.id, false), 'Could not delete.');
                  onNavigate({ kind: 'all' });
                }}
              >
                {current.mapCount > 0 ? 'Delete collection, keep maps' : 'Delete collection'}
              </button>
            </>
          }
        >
          {current.mapCount > 0 ? (
            <p>
              It contains {current.mapCount} map{current.mapCount === 1 ? '' : 's'}. If you keep
              them, they move to “Not in a collection”. Deleted maps can't be recovered except from
              a backup.
            </p>
          ) : (
            <p>The collection is empty.</p>
          )}
        </Dialog>
      )}
    </div>
  );
}
