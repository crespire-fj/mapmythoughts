import { useEffect, useRef, useState } from 'react';
import { Copy, ExternalLink, Waypoints, X } from 'lucide-react';
import { MARKERS, ROOT_ID, type Marker, type NodeSnapshot } from '../../model/schema';
import { MARKER_INFO, MarkerIcon } from '../markers';
import { internalLink, parseInternalLink, safeUrl } from '../url';

interface Props {
  nodeId: string;
  node: NodeSnapshot | null; // null for the root
  title: string;
  count: number;
  /** this map, and the other maps a node can link to */
  mapId: string;
  maps: { id: string; title: string }[];
  onCopyLink: () => void;
  onText: (text: string) => void;
  onNote: (note: string) => void;
  onLink: (link: string) => void;
  onMarker: (marker: Marker | null) => void;
  onEditSession: () => void;
  onClose: () => void;
}

/** A textarea that follows outside changes (undo, other tabs) unless it is being typed in. */
function SyncedTextarea({
  value,
  onChange,
  onEditSession,
  ...rest
}: {
  value: string;
  onChange: (value: string) => void;
  onEditSession: () => void;
} & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (element && document.activeElement !== element && element.value !== value) {
      element.value = value;
    }
  }, [value]);
  return (
    <textarea
      ref={ref}
      defaultValue={value}
      onChange={(event) => onChange(event.target.value)}
      onFocus={onEditSession}
      onBlur={onEditSession}
      {...rest}
    />
  );
}

/** Where an in-app link goes, with a way to follow it. */
function LinkTarget({
  link,
  mapId,
  maps,
}: {
  link: string;
  mapId: string;
  maps: { id: string; title: string }[];
}) {
  const target = parseInternalLink(link);
  if (!target) return null;
  const map = target.mapId === mapId ? null : maps.find((m) => m.id === target.mapId);
  const name =
    target.mapId === mapId
      ? 'a node in this map'
      : map
        ? `${target.nodeId ? 'a node in ' : ''}“${map.title.replace(/\s+/g, ' ') || 'Untitled map'}”`
        : 'a map that no longer exists';
  return (
    <p className="link-target">
      <Waypoints size={14} aria-hidden="true" />
      <span>Goes to {name}</span>
      {(map || target.mapId === mapId) && (
        <a className="link-target__go" href={link}>
          Go
        </a>
      )}
    </p>
  );
}

export function DetailsPanel(props: Props) {
  const { nodeId, node, title, count } = props;
  const isRoot = nodeId === ROOT_ID;
  const [linkDraft, setLinkDraft] = useState(node?.link ?? '');
  const [linkError, setLinkError] = useState(false);
  const [linkSource, setLinkSource] = useState(node?.link);
  if (linkSource !== node?.link) {
    setLinkSource(node?.link);
    setLinkDraft(node?.link ?? '');
    setLinkError(false);
  }

  const commitLink = () => {
    const url = safeUrl(linkDraft);
    if (linkDraft.trim() && !url) {
      setLinkError(true);
      return;
    }
    setLinkError(false);
    if (url !== (node?.link ?? '')) props.onLink(url);
  };

  return (
    <aside className="panel panel--right" aria-label="Node details">
      <header className="panel__header">
        <h2>{count > 1 ? `${count} nodes selected` : isRoot ? 'Map title' : 'Details'}</h2>
        <button className="icon-button" onClick={props.onClose} aria-label="Close details">
          <X size={18} />
        </button>
      </header>
      {count > 1 ? (
        <p className="panel__hint">Select a single node to edit its note and link.</p>
      ) : (
        <div className="panel__body" key={nodeId}>
          <label className="field">
            <span className="field__label">{isRoot ? 'Title' : 'Text'}</span>
            <SyncedTextarea
              className="field__input field__input--text"
              rows={2}
              value={isRoot ? title : (node?.text ?? '')}
              onChange={props.onText}
              onEditSession={props.onEditSession}
            />
          </label>
          <button
            type="button"
            className="button button--ghost panel__copy"
            onClick={props.onCopyLink}
          >
            <Copy size={15} /> {isRoot ? 'Copy link to this map' : 'Copy link to this node'}
          </button>
          {!isRoot && node && (
            <>
              <label className="field">
                <span className="field__label">Note</span>
                <SyncedTextarea
                  className="field__input field__input--note"
                  rows={8}
                  placeholder="Background, evidence, decisions, next steps…"
                  value={node.note}
                  onChange={props.onNote}
                  onEditSession={props.onEditSession}
                />
              </label>
              <div className="field">
                <label className="field__label" htmlFor={`link-${nodeId}`}>
                  Link
                </label>
                <div className="field__row">
                  <input
                    id={`link-${nodeId}`}
                    className={`field__input${linkError ? ' is-invalid' : ''}`}
                    type="text"
                    inputMode="url"
                    placeholder="https://… or a copied map link"
                    value={linkDraft}
                    aria-invalid={linkError}
                    onChange={(event) => setLinkDraft(event.target.value)}
                    onBlur={commitLink}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') commitLink();
                    }}
                  />
                  {node.link && !parseInternalLink(node.link) && (
                    <a
                      className="icon-button"
                      href={node.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Open link"
                      title="Open link"
                    >
                      <ExternalLink size={16} />
                    </a>
                  )}
                </div>
                {linkError && (
                  <span className="field__error">
                    Enter a web or email address, or a link copied from a map.
                  </span>
                )}
                <LinkTarget link={node.link} mapId={props.mapId} maps={props.maps} />
                <select
                  className="field__input field__select"
                  aria-label="Link to another map"
                  value=""
                  onChange={(event) => {
                    if (event.target.value) props.onLink(internalLink(event.target.value));
                  }}
                >
                  <option value="">Link to another map…</option>
                  {props.maps
                    .filter((m) => m.id !== props.mapId)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.title.replace(/\s+/g, ' ') || 'Untitled map'}
                      </option>
                    ))}
                </select>
              </div>
              <div className="field">
                <span className="field__label">Marker</span>
                <div className="marker-picker" role="radiogroup" aria-label="Marker">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={!node.marker}
                    className={`marker-picker__item${!node.marker ? ' is-active' : ''}`}
                    onClick={() => props.onMarker(null)}
                  >
                    None
                  </button>
                  {MARKERS.map((marker) => (
                    <button
                      key={marker}
                      type="button"
                      role="radio"
                      aria-checked={node.marker === marker}
                      className={`marker-picker__item${node.marker === marker ? ' is-active' : ''}`}
                      onClick={() => props.onMarker(marker)}
                      title={MARKER_INFO[marker].label}
                    >
                      <MarkerIcon marker={marker} decorative />
                      <span>{MARKER_INFO[marker].label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </aside>
  );
}
