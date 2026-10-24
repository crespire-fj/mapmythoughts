import { useCallback, useEffect, useState } from 'react';
import { Clock, RotateCcw, Save, Trash2, X } from 'lucide-react';
import { api, type VersionSummary } from '../../maps/api';

interface Props {
  mapId: string;
  onRestore: (version: VersionSummary) => Promise<void>;
  onClose: () => void;
}

const dayFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});
const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

/** Named versions you save, plus automatic ones taken every 30 minutes while you edit. */
export function VersionsPanel({ mapId, onRestore, onClose }: Props) {
  const [versions, setVersions] = useState<VersionSummary[] | null>(null);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.versions
      .list(mapId)
      .then(setVersions)
      .catch(() => setError('Could not load the history.'));
  }, [mapId]);
  useEffect(load, [load]);

  const save = async () => {
    setBusy(true);
    try {
      await api.versions.create(mapId, label.trim() || 'Saved version');
      setLabel('');
      load();
    } catch {
      setError('Could not save the version.');
    } finally {
      setBusy(false);
    }
  };

  const groups = new Map<string, VersionSummary[]>();
  for (const version of versions ?? []) {
    const day = dayFormat.format(new Date(version.createdAt));
    groups.set(day, [...(groups.get(day) ?? []), version]);
  }

  return (
    <aside className="panel panel--right" aria-label="Version history">
      <header className="panel__header">
        <h2>History</h2>
        <button className="icon-button" onClick={onClose} aria-label="Close history">
          <X size={18} />
        </button>
      </header>
      <form
        className="version-save"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <input
          className="field__input"
          placeholder="Name this version (optional)"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          aria-label="Version name"
        />
        <button className="button button--primary" disabled={busy} type="submit">
          <Save size={16} /> Save version
        </button>
      </form>
      <p className="panel__hint">
        An automatic version is kept every 30 minutes while you edit. Restoring can be undone.
      </p>
      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
      <div className="versions">
        {versions?.length === 0 && <p className="panel__hint">No versions yet.</p>}
        {[...groups].map(([day, items]) => (
          <section key={day}>
            <h3 className="versions__day">{day}</h3>
            <ul>
              {items.map((version) => (
                <li key={version.id} className={`version${version.auto ? ' version--auto' : ''}`}>
                  <span className="version__icon">
                    {version.auto ? <Clock size={15} /> : <Save size={15} />}
                  </span>
                  <span className="version__body">
                    <span className="version__label">{version.label}</span>
                    <span className="version__meta">
                      {timeFormat.format(new Date(version.createdAt))} · {version.nodeCount} nodes
                    </span>
                  </span>
                  <button
                    className="icon-button"
                    title="Restore this version"
                    aria-label={`Restore ${version.label} from ${timeFormat.format(new Date(version.createdAt))}`}
                    onClick={() => void onRestore(version).then(load)}
                  >
                    <RotateCcw size={16} />
                  </button>
                  {!version.auto && (
                    <button
                      className="icon-button"
                      title="Delete this version"
                      aria-label={`Delete version ${version.label}`}
                      onClick={() => {
                        if (window.confirm(`Delete the version “${version.label}”?`)) {
                          void api.versions.remove(mapId, version.id).then(load);
                        }
                      }}
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </aside>
  );
}
