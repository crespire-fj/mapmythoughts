import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import * as Y from 'yjs';
import type { Hocuspocus } from '@hocuspocus/server';
import {
  UNIQUE_VIOLATION,
  createCollection,
  createMap,
  createVersion,
  deleteCollection,
  deleteMap,
  deleteVersion,
  getCollection,
  getMap,
  getThumbnail,
  getVersionState,
  listCollections,
  listMaps,
  listVersions,
  loadState,
  setMapCollection,
  setThumbnail,
  updateCollection,
  type CollectionRow,
  type MapRow,
  type VersionRow,
} from './db.ts';
import { docFromState, statsOf } from './stats.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 20 * 1024 * 1024;

export function isMapId(value: string): boolean {
  return UUID.test(value);
}

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function send(response: ServerResponse, status: number, body?: unknown): void {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  response.end(body === undefined ? '' : JSON.stringify(body));
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'Body too large');
    chunks.push(chunk as Buffer);
  }
  if (!chunks.length) return {};
  try {
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (value && typeof value === 'object') return value as Record<string, unknown>;
  } catch {
    // fall through
  }
  throw new HttpError(400, 'Invalid JSON');
}

const mapJson = (row: MapRow) => ({
  id: row.id,
  title: row.title,
  theme: row.theme,
  nodeCount: row.node_count,
  collectionId: row.collection_id,
  thumbnailAt: row.thumbnail_at?.toISOString() ?? null,
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
});

const collectionJson = (row: CollectionRow) => ({
  id: row.id,
  name: row.name,
  color: row.color,
  mapCount: row.map_count,
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
});

const COLOR = /^#[0-9a-f]{6}$/i;
const MAX_THUMBNAIL_CHARS = 400_000;

/**
 * Thumbnails are SVG made by the app: shapes and colours only. Anything that could run script or
 * load something is refused, and they are served with a CSP that forbids both anyway.
 */
function validThumbnail(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || value.length > MAX_THUMBNAIL_CHARS) {
    throw new HttpError(400, 'Invalid thumbnail');
  }
  const svg = value.trim();
  const forbidden =
    /<script|<foreignobject|<iframe|<image|\son[a-z]+\s*=|javascript:|href\s*=|@import/i;
  if (!svg.startsWith('<svg') || !svg.endsWith('</svg>') || forbidden.test(svg)) {
    throw new HttpError(400, 'Invalid thumbnail');
  }
  return svg;
}

function collectionName(value: unknown): string {
  const name = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  if (!name || name.length > 80)
    throw new HttpError(400, 'A collection needs a name of 1–80 characters');
  return name;
}

/** Reads an optional collectionId from a request body: a known collection, or null. */
async function collectionIdFrom(body: Record<string, unknown>): Promise<string | null> {
  const value = body.collectionId;
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || !isMapId(value) || !(await getCollection(value))) {
    throw new HttpError(400, 'Unknown collection');
  }
  return value;
}

/** Turns a duplicate-name database error into a friendly 409. */
function nameTaken(error: unknown): never {
  if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
    throw new HttpError(409, 'There is already a collection with that name');
  }
  throw error;
}

const versionJson = (row: VersionRow) => ({
  id: row.id,
  label: row.label,
  auto: row.auto,
  nodeCount: row.node_count,
  createdAt: row.created_at.toISOString(),
});

/** The newest state of a map: the open document if someone is editing it, else the database. */
async function currentState(hocuspocus: Hocuspocus, id: string): Promise<Uint8Array> {
  const live = hocuspocus.documents.get(id);
  if (live) return Y.encodeStateAsUpdate(live);
  const stored = await loadState(id);
  if (!stored) throw new HttpError(404, 'Map not found');
  return stored;
}

async function requireMap(id: string): Promise<MapRow> {
  const row = isMapId(id) ? await getMap(id) : null;
  if (!row) throw new HttpError(404, 'Map not found');
  return row;
}

/**
 * Handles /api/* requests. Returns true when the request was answered, so the caller can stop
 * Hocuspocus from writing its default response.
 */
export async function handleApi(
  request: IncomingMessage,
  response: ServerResponse,
  hocuspocus: Hocuspocus,
): Promise<boolean> {
  const url = new URL(request.url ?? '/', 'http://localhost');
  if (!url.pathname.startsWith('/api/')) return false;
  const method = request.method ?? 'GET';
  const parts = url.pathname.split('/').filter(Boolean).slice(1); // drop "api"

  try {
    if (parts[0] === 'health' && method === 'GET') {
      send(response, 200, { ok: true });
      return true;
    }

    // /api/collections[/:id]
    if (parts[0] === 'collections') {
      const id = parts[1];
      if (!id && method === 'GET') {
        send(response, 200, (await listCollections()).map(collectionJson));
        return true;
      }
      if (!id && method === 'POST') {
        const body = await readJson(request);
        const name = collectionName(body.name);
        const color =
          typeof body.color === 'string' && COLOR.test(body.color) ? body.color : '#6246ea';
        const newId = randomUUID();
        await createCollection(newId, name, color).catch(nameTaken);
        send(response, 201, collectionJson((await getCollection(newId))!));
        return true;
      }
      const existing = id && isMapId(id) ? await getCollection(id) : null;
      if (!existing) throw new HttpError(404, 'Collection not found');
      if (method === 'GET') {
        send(response, 200, collectionJson(existing));
        return true;
      }
      if (method === 'PATCH') {
        const body = await readJson(request);
        const patch: { name?: string; color?: string } = {};
        if (body.name !== undefined) patch.name = collectionName(body.name);
        if (body.color !== undefined) {
          if (typeof body.color !== 'string' || !COLOR.test(body.color)) {
            throw new HttpError(400, 'Colours are #rrggbb');
          }
          patch.color = body.color;
        }
        await updateCollection(existing.id, patch).catch(nameTaken);
        send(response, 200, collectionJson((await getCollection(existing.id))!));
        return true;
      }
      if (method === 'DELETE') {
        const deleteMaps = url.searchParams.get('deleteMaps') === 'true';
        const deleted = (await deleteCollection(existing.id, deleteMaps)) ?? [];
        for (const mapId of deleted) hocuspocus.closeConnections(mapId);
        send(response, 200, { deletedMaps: deleted.length });
        return true;
      }
    }

    if (parts[0] !== 'maps') throw new HttpError(404, 'Not found');
    const [, mapId, sub, versionId] = parts;

    // /api/maps
    if (!mapId) {
      if (method === 'GET') {
        send(response, 200, (await listMaps()).map(mapJson));
        return true;
      }
      if (method === 'POST') {
        const body = await readJson(request);
        if (typeof body.state !== 'string') throw new HttpError(400, 'Expected { state: base64 }');
        const state = new Uint8Array(Buffer.from(body.state, 'base64'));
        const id = randomUUID();
        let stats;
        try {
          stats = statsOf(docFromState(state));
        } catch {
          throw new HttpError(400, 'That is not a valid map');
        }
        await createMap(
          id,
          stats,
          state,
          await collectionIdFrom(body),
          validThumbnail(body.thumbnail),
        );
        send(response, 201, { id });
        return true;
      }
    }

    if (mapId && !sub) {
      if (method === 'GET') {
        send(response, 200, mapJson(await requireMap(mapId)));
        return true;
      }
      if (method === 'PATCH') {
        await requireMap(mapId);
        const body = await readJson(request);
        if (!('collectionId' in body)) throw new HttpError(400, 'Expected { collectionId }');
        await setMapCollection(mapId, await collectionIdFrom(body));
        send(response, 200, mapJson((await getMap(mapId))!));
        return true;
      }
      if (method === 'DELETE') {
        await requireMap(mapId);
        hocuspocus.closeConnections(mapId);
        await deleteMap(mapId);
        send(response, 204);
        return true;
      }
    }

    // /api/maps/:id/thumbnail(.svg)
    if (mapId && sub === 'thumbnail' && method === 'PUT') {
      await requireMap(mapId);
      const body = await readJson(request);
      const svg = validThumbnail(body.svg);
      if (!svg) throw new HttpError(400, 'Expected { svg }');
      await setThumbnail(mapId, svg);
      send(response, 204);
      return true;
    }
    if (mapId && sub === 'thumbnail.svg' && method === 'GET') {
      const svg = isMapId(mapId) ? await getThumbnail(mapId) : null;
      if (!svg) throw new HttpError(404, 'No thumbnail');
      response.writeHead(200, {
        'Content-Type': 'image/svg+xml; charset=utf-8',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, max-age=31536000, immutable',
      });
      response.end(svg);
      return true;
    }

    // /api/maps/:id/export: everything needed to recreate the map elsewhere
    if (mapId && sub === 'export' && method === 'GET') {
      const map = await requireMap(mapId);
      const state = await currentState(hocuspocus, mapId);
      send(response, 200, {
        title: map.title,
        collectionId: map.collection_id,
        state: Buffer.from(state).toString('base64'),
        thumbnail: await getThumbnail(mapId),
      });
      return true;
    }

    // /api/maps/:id/duplicate
    if (mapId && sub === 'duplicate' && method === 'POST') {
      const original = await requireMap(mapId);
      const doc = docFromState(await currentState(hocuspocus, mapId));
      const title = doc.getText('title');
      doc.transact(() => {
        title.delete(0, title.length);
        title.insert(0, `${original.title || 'Untitled map'} (copy)`);
      });
      const state = Y.encodeStateAsUpdate(doc);
      const id = randomUUID();
      await createMap(id, statsOf(doc), state, original.collection_id, await getThumbnail(mapId));
      send(response, 201, { id });
      return true;
    }

    // /api/maps/:id/versions[/:versionId]
    if (mapId && sub === 'versions') {
      await requireMap(mapId);
      if (!versionId && method === 'GET') {
        send(response, 200, (await listVersions(mapId)).map(versionJson));
        return true;
      }
      if (!versionId && method === 'POST') {
        const body = await readJson(request);
        const label = typeof body.label === 'string' ? body.label.trim().slice(0, 200) : '';
        const state = await currentState(hocuspocus, mapId);
        const row = await createVersion(
          mapId,
          label || 'Saved version',
          statsOf(docFromState(state)).nodeCount,
          state,
        );
        send(response, 201, versionJson(row));
        return true;
      }
      if (versionId && /^\d+$/.test(versionId)) {
        if (method === 'GET') {
          const state = await getVersionState(mapId, versionId);
          if (!state) throw new HttpError(404, 'Version not found');
          send(response, 200, { state: Buffer.from(state).toString('base64') });
          return true;
        }
        if (method === 'DELETE') {
          const deleted = await deleteVersion(mapId, versionId);
          if (!deleted) throw new HttpError(404, 'Version not found');
          send(response, 204);
          return true;
        }
      }
    }

    throw new HttpError(404, 'Not found');
  } catch (error) {
    if (error instanceof HttpError) {
      send(response, error.status, { error: error.message });
    } else {
      console.error(error);
      send(response, 500, { error: 'Internal error' });
    }
  }
  return true;
}
