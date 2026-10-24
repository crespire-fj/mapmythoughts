import * as Y from 'yjs';
import type { ThemeId } from '../model/schema';

export interface MapSummary {
  id: string;
  title: string;
  theme: ThemeId;
  nodeCount: number;
  /** null when the map isn't in a collection */
  collectionId: string | null;
  /** when the preview picture last changed; null if there isn't one yet */
  thumbnailAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Collection {
  id: string;
  name: string;
  color: string;
  mapCount: number;
  createdAt: string;
  updatedAt: string;
}

/** Colours offered for collections. */
// Brand violet, pink and orange first; existing collections keep the colour they have.
export const COLLECTION_COLORS = [
  '#6246ea',
  '#e8457c',
  '#ff8c42',
  '#2bb673',
  '#1597bb',
  '#f2a93b',
  '#00a6a6',
  '#64748b',
];

export interface VersionSummary {
  id: string;
  label: string;
  auto: boolean;
  nodeCount: number;
  createdAt: string;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(response.status, body?.error ?? response.statusText);
  }
  return (response.status === 204 ? undefined : await response.json()) as T;
}

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const mapPath = (id: string) => `/api/maps/${encodeURIComponent(id)}`;

export const api = {
  list: () => request<MapSummary[]>('/api/maps'),
  get: (id: string) => request<MapSummary>(mapPath(id)),
  remove: (id: string) => request<void>(mapPath(id), { method: 'DELETE' }),
  /**
   * Creates a map from a prepared document (empty, template or import), optionally inside a
   * collection, and returns its id.
   */
  create: async (
    doc: Y.Doc | Uint8Array,
    collectionId: string | null = null,
    thumbnail: string | null = null,
  ) => {
    const state = toBase64(doc instanceof Uint8Array ? doc : Y.encodeStateAsUpdate(doc));
    const { id } = await request<{ id: string }>('/api/maps', {
      method: 'POST',
      body: JSON.stringify({ state, collectionId, thumbnail }),
    });
    return id;
  },
  /** Everything needed to recreate a map elsewhere (for .mmt files). */
  exportMap: async (id: string) => {
    const data = await request<{
      title: string;
      collectionId: string | null;
      state: string;
      thumbnail: string | null;
    }>(`${mapPath(id)}/export`);
    return { ...data, state: fromBase64(data.state) };
  },
  setThumbnail: (id: string, svg: string) =>
    request<void>(`${mapPath(id)}/thumbnail`, { method: 'PUT', body: JSON.stringify({ svg }) }),
  thumbnailUrl: (map: MapSummary) =>
    `${mapPath(map.id)}/thumbnail.svg?v=${encodeURIComponent(map.thumbnailAt ?? '')}`,
  /** Moves a map into a collection, or out of any with null. */
  move: (id: string, collectionId: string | null) =>
    request<MapSummary>(mapPath(id), { method: 'PATCH', body: JSON.stringify({ collectionId }) }),
  duplicate: async (id: string) =>
    (await request<{ id: string }>(`${mapPath(id)}/duplicate`, { method: 'POST' })).id,
  collections: {
    list: () => request<Collection[]>('/api/collections'),
    get: (id: string) => request<Collection>(`/api/collections/${encodeURIComponent(id)}`),
    create: (name: string, color: string) =>
      request<Collection>('/api/collections', {
        method: 'POST',
        body: JSON.stringify({ name, color }),
      }),
    update: (id: string, patch: { name?: string; color?: string }) =>
      request<Collection>(`/api/collections/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    /** Deletes a collection; its maps are kept (moved out) unless `deleteMaps`. */
    remove: (id: string, deleteMaps: boolean) =>
      request<{ deletedMaps: number }>(
        `/api/collections/${encodeURIComponent(id)}?deleteMaps=${deleteMaps}`,
        { method: 'DELETE' },
      ),
  },
  versions: {
    list: (id: string) => request<VersionSummary[]>(`${mapPath(id)}/versions`),
    create: (id: string, label: string) =>
      request<VersionSummary>(`${mapPath(id)}/versions`, {
        method: 'POST',
        body: JSON.stringify({ label }),
      }),
    /** Loads a version as a standalone document. */
    load: async (id: string, versionId: string) => {
      const { state } = await request<{ state: string }>(`${mapPath(id)}/versions/${versionId}`);
      const doc = new Y.Doc();
      Y.applyUpdate(doc, fromBase64(state));
      return doc;
    },
    remove: (id: string, versionId: string) =>
      request<void>(`${mapPath(id)}/versions/${versionId}`, { method: 'DELETE' }),
  },
};

export function syncUrl(): string {
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/sync`;
}
