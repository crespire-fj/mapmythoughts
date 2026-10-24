import { useState } from 'react';
import { Copy, Ellipsis, FileDown, FolderMinus, Trash2 } from 'lucide-react';
import { useColorMode } from '../theme/colorMode';
import { THEMES } from '../theme/themes';
import { Menu, MenuItem, MenuSection } from '../ui/Menu';
import { api, type Collection, type MapSummary } from './api';
import { Artwork } from './Artwork';
import { ago } from './format';

/** Drag-and-drop type for moving map cards onto collections. */
export const MAP_DRAG_TYPE = 'application/x-eqapmap-map';

interface Props {
  map: MapSummary;
  collections: Collection[];
  /** show which collection the map is in (on the "All maps" view) */
  showCollection: boolean;
  onOpen: () => void;
  onMove: (collectionId: string | null) => void;
  onDuplicate: () => void;
  onExport: () => void;
  onDelete: () => void;
}

export function MapCard({ map, collections, showCollection, ...props }: Props) {
  const title = map.title || 'Untitled map';
  const collection = collections.find((c) => c.id === map.collectionId);
  const { mode } = useColorMode();
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const showThumbnail = !!map.thumbnailAt && !thumbnailFailed;
  return (
    <li
      className="card"
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData(MAP_DRAG_TYPE, map.id);
        event.dataTransfer.effectAllowed = 'move';
        event.currentTarget.classList.add('is-dragging');
      }}
      onDragEnd={(event) => event.currentTarget.classList.remove('is-dragging')}
    >
      <button className="card__open" onClick={props.onOpen} aria-label={`Open ${title}`}>
        {showThumbnail ? (
          <span
            className="card__thumb"
            style={{ background: (THEMES[map.theme] ?? THEMES.lagoon).canvas[mode] }}
          >
            <img
              src={api.thumbnailUrl(map)}
              alt=""
              loading="lazy"
              onError={() => setThumbnailFailed(true)}
            />
          </span>
        ) : (
          <Artwork
            theme={map.theme}
            seed={map.id}
            branches={Math.min(8, Math.max(3, Math.round(Math.sqrt(map.nodeCount * 2))))}
          />
        )}
        <span className="card__body">
          <span className="card__title">{title}</span>
          <span className="card__meta">
            {map.nodeCount} node{map.nodeCount === 1 ? '' : 's'} · edited {ago(map.updatedAt)}
          </span>
          {showCollection && collection && (
            <span className="chip">
              <span className="chip__dot" style={{ background: collection.color }} />
              {collection.name}
            </span>
          )}
        </span>
      </button>
      <div className="card__actions">
        <Menu label={<Ellipsis size={18} />} title={`Actions for ${title}`}>
          {(close) => (
            <>
              <MenuSection title="Move to collection">
                {collections.length === 0 && (
                  <p className="menu__note">Create a collection in the sidebar first.</p>
                )}
                {collections.map((c) => (
                  <MenuItem
                    key={c.id}
                    checked={c.id === map.collectionId}
                    onSelect={() => {
                      close();
                      if (c.id !== map.collectionId) props.onMove(c.id);
                    }}
                  >
                    <span className="menu__swatch" style={{ background: c.color }} />
                    {c.name}
                  </MenuItem>
                ))}
                {map.collectionId && (
                  <MenuItem
                    onSelect={() => {
                      close();
                      props.onMove(null);
                    }}
                  >
                    <FolderMinus size={15} /> Remove from collection
                  </MenuItem>
                )}
              </MenuSection>
              <MenuSection title="Map">
                <MenuItem
                  onSelect={() => {
                    close();
                    props.onDuplicate();
                  }}
                >
                  <Copy size={15} /> Duplicate
                </MenuItem>
                <MenuItem
                  onSelect={() => {
                    close();
                    props.onExport();
                  }}
                >
                  <FileDown size={15} /> Export file to share (.mmt)
                </MenuItem>
                <MenuItem
                  onSelect={() => {
                    close();
                    props.onDelete();
                  }}
                >
                  <Trash2 size={15} /> Delete
                </MenuItem>
              </MenuSection>
            </>
          )}
        </Menu>
      </div>
    </li>
  );
}
