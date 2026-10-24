import * as Y from 'yjs';
import { getTitle } from '../model/schema';
import { fromBase64, toBase64 } from '../maps/api';

/**
 * The .mmt (Map My Thoughts) file: one or more maps with everything intact (text, notes, links, markers, styles,
 * cross-links, layout and theme), plus the collection they came from. It's JSON so it can be
 * inspected, and each map's content is its complete Yjs document.
 */
export const FILE_FORMAT = 'mapmythoughts';
export const FILE_VERSION = 1;
export const FILE_EXTENSION = '.mmt';
/** Files shared before the app was renamed (EQAP Map, .eqapmap) are read the same way. */
export const LEGACY_FORMATS = ['eqapmap'];
export const LEGACY_EXTENSIONS = ['.eqapmap'];

/** Whether a chosen file should be read as a map file rather than a Markdown outline. */
export function isMapFile(name: string, text: string): boolean {
  const lower = name.toLowerCase();
  return (
    [FILE_EXTENSION, ...LEGACY_EXTENSIONS].some((ext) => lower.endsWith(ext)) ||
    text.trimStart().startsWith('{')
  );
}

export interface FileMap {
  title: string;
  /** base64 Yjs update holding the whole map */
  state: string;
  thumbnail: string | null;
  collection: { name: string; color: string } | null;
}

export interface MapFile {
  format: string;
  version: number;
  exportedAt: string;
  maps: FileMap[];
}

export interface ParsedMap {
  title: string;
  state: Uint8Array;
  thumbnail: string | null;
  collection: { name: string; color: string } | null;
}

export function buildMapFile(
  maps: {
    title: string;
    state: Uint8Array;
    thumbnail: string | null;
    collection: FileMap['collection'];
  }[],
): string {
  const file: MapFile = {
    format: FILE_FORMAT,
    version: FILE_VERSION,
    exportedAt: new Date().toISOString(),
    maps: maps.map((m) => ({
      title: m.title,
      state: toBase64(m.state),
      thumbnail: m.thumbnail,
      collection: m.collection,
    })),
  };
  return JSON.stringify(file, null, 1);
}

export class MapFileError extends Error {}

/** Reads and checks a .mmt (or older .eqapmap) file; every map must decode into a valid document. */
export function parseMapFile(text: string): ParsedMap[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new MapFileError('This file is not a Map My Thoughts file.');
  }
  const file = data as Partial<MapFile>;
  const known = file && (file.format === FILE_FORMAT || LEGACY_FORMATS.includes(file.format!));
  if (!known || !Array.isArray(file.maps)) {
    throw new MapFileError('This file is not a Map My Thoughts file.');
  }
  if (typeof file.version !== 'number' || file.version > FILE_VERSION) {
    throw new MapFileError('This file was made by a newer version of Map My Thoughts.');
  }
  if (!file.maps.length) throw new MapFileError('The file contains no maps.');
  return file.maps.map((map, i) => {
    if (!map || typeof map.state !== 'string') throw new MapFileError(`Map ${i + 1} is damaged.`);
    let state: Uint8Array;
    const doc = new Y.Doc();
    try {
      state = fromBase64(map.state);
      Y.applyUpdate(doc, state);
    } catch {
      throw new MapFileError(`Map ${i + 1} is damaged.`);
    }
    const collection =
      map.collection && typeof map.collection.name === 'string' && map.collection.name.trim()
        ? {
            name: map.collection.name.trim().slice(0, 80),
            color: /^#[0-9a-f]{6}$/i.test(map.collection.color ?? '')
              ? map.collection.color
              : '#6246ea',
          }
        : null;
    return {
      title: getTitle(doc).toString() || map.title || 'Untitled map',
      state,
      thumbnail: typeof map.thumbnail === 'string' ? map.thumbnail : null,
      collection,
    };
  });
}
