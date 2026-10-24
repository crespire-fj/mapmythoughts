import pg from 'pg';

export const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ??
    'postgres://mapmythoughts:mapmythoughts@localhost:5432/mapmythoughts',
  max: 5,
});

export interface MapStats {
  title: string;
  theme: string;
  nodeCount: number;
}

export interface MapRow {
  id: string;
  title: string;
  theme: string;
  node_count: number;
  collection_id: string | null;
  thumbnail_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface VersionRow {
  id: string;
  label: string;
  auto: boolean;
  node_count: number;
  created_at: Date;
}

/** Automatic versions are taken at most this often while a map is being edited. */
export const AUTO_VERSION_INTERVAL_MINUTES = 30;
/** Automatic versions kept per map (named versions are always kept). */
export const AUTO_VERSIONS_KEPT = 100;

/** Waits for Postgres to accept connections, then creates or upgrades the schema. */
export async function migrate(retries = 30): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS maps (
          id uuid PRIMARY KEY,
          title text NOT NULL DEFAULT '',
          state bytea,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        );
        ALTER TABLE maps ADD COLUMN IF NOT EXISTS theme text NOT NULL DEFAULT 'lagoon';
        ALTER TABLE maps ADD COLUMN IF NOT EXISTS node_count integer NOT NULL DEFAULT 0;
        CREATE TABLE IF NOT EXISTS map_versions (
          id bigserial PRIMARY KEY,
          map_id uuid NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
          label text NOT NULL DEFAULT '',
          auto boolean NOT NULL DEFAULT false,
          node_count integer NOT NULL DEFAULT 0,
          state bytea NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS map_versions_map_created ON map_versions (map_id, created_at DESC);
        CREATE TABLE IF NOT EXISTS collections (
          id uuid PRIMARY KEY,
          name text NOT NULL,
          color text NOT NULL DEFAULT '#1597bb',
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE UNIQUE INDEX IF NOT EXISTS collections_name ON collections (lower(name));
        ALTER TABLE maps ADD COLUMN IF NOT EXISTS collection_id uuid
          REFERENCES collections(id) ON DELETE SET NULL;
        CREATE INDEX IF NOT EXISTS maps_collection ON maps (collection_id);
        ALTER TABLE maps ADD COLUMN IF NOT EXISTS thumbnail text;
        ALTER TABLE maps ADD COLUMN IF NOT EXISTS thumbnail_at timestamptz;
      `);
      return;
    } catch (error) {
      if (attempt >= retries) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

const MAP_COLUMNS =
  'id, title, theme, node_count, collection_id, thumbnail_at, created_at, updated_at';

/** Fills in title/theme/node counts for maps saved before those columns existed. */
export async function backfillStats(statsOfState: (state: Uint8Array) => MapStats): Promise<void> {
  const result = await pool.query<{ id: string; state: Buffer }>(
    'SELECT id, state FROM maps WHERE node_count = 0 AND state IS NOT NULL',
  );
  for (const row of result.rows) {
    const stats = statsOfState(new Uint8Array(row.state));
    if (stats.nodeCount === 0) continue;
    await pool.query('UPDATE maps SET title = $2, theme = $3, node_count = $4 WHERE id = $1', [
      row.id,
      stats.title,
      stats.theme,
      stats.nodeCount,
    ]);
  }
}

export async function listMaps(): Promise<MapRow[]> {
  const result = await pool.query<MapRow>(
    `SELECT ${MAP_COLUMNS} FROM maps ORDER BY updated_at DESC`,
  );
  return result.rows;
}

export async function getMap(id: string): Promise<MapRow | null> {
  const result = await pool.query<MapRow>(`SELECT ${MAP_COLUMNS} FROM maps WHERE id = $1`, [id]);
  return result.rows[0] ?? null;
}

export async function mapExists(id: string): Promise<boolean> {
  const result = await pool.query('SELECT 1 FROM maps WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}

export async function createMap(
  id: string,
  stats: MapStats,
  state: Uint8Array,
  collectionId: string | null = null,
  thumbnail: string | null = null,
): Promise<void> {
  await pool.query(
    `INSERT INTO maps (id, title, theme, node_count, state, collection_id, thumbnail, thumbnail_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, CASE WHEN $7::text IS NULL THEN NULL ELSE now() END)`,
    [id, stats.title, stats.theme, stats.nodeCount, Buffer.from(state), collectionId, thumbnail],
  );
}

export async function getThumbnail(id: string): Promise<string | null> {
  const result = await pool.query<{ thumbnail: string | null }>(
    'SELECT thumbnail FROM maps WHERE id = $1',
    [id],
  );
  return result.rows[0]?.thumbnail ?? null;
}

/** Saves a map's preview picture. Doesn't change "last edited". */
export async function setThumbnail(id: string, svg: string): Promise<boolean> {
  const result = await pool.query(
    'UPDATE maps SET thumbnail = $2, thumbnail_at = now() WHERE id = $1 AND thumbnail IS DISTINCT FROM $2',
    [id, svg],
  );
  return (result.rowCount ?? 0) > 0;
}

/** Moves a map into a collection (or out of any, with null). Doesn't change "last edited". */
export async function setMapCollection(id: string, collectionId: string | null): Promise<boolean> {
  const result = await pool.query('UPDATE maps SET collection_id = $2 WHERE id = $1', [
    id,
    collectionId,
  ]);
  return (result.rowCount ?? 0) > 0;
}

// ----- collections ----------------------------------------------------------------------------

export interface CollectionRow {
  id: string;
  name: string;
  color: string;
  map_count: number;
  created_at: Date;
  /** latest of the collection's own change and its maps' edits */
  updated_at: Date;
}

const COLLECTION_SELECT = `
  SELECT c.id, c.name, c.color, c.created_at,
         count(m.id)::int AS map_count,
         greatest(c.updated_at, max(m.updated_at)) AS updated_at
  FROM collections c LEFT JOIN maps m ON m.collection_id = c.id`;

export async function listCollections(): Promise<CollectionRow[]> {
  const result = await pool.query<CollectionRow>(
    `${COLLECTION_SELECT} GROUP BY c.id ORDER BY lower(c.name)`,
  );
  return result.rows;
}

export async function getCollection(id: string): Promise<CollectionRow | null> {
  const result = await pool.query<CollectionRow>(
    `${COLLECTION_SELECT} WHERE c.id = $1 GROUP BY c.id`,
    [id],
  );
  return result.rows[0] ?? null;
}

/** Postgres unique-violation code, raised when a collection name is already taken. */
export const UNIQUE_VIOLATION = '23505';

export async function createCollection(id: string, name: string, color: string): Promise<void> {
  await pool.query('INSERT INTO collections (id, name, color) VALUES ($1, $2, $3)', [
    id,
    name,
    color,
  ]);
}

export async function updateCollection(
  id: string,
  patch: { name?: string; color?: string },
): Promise<boolean> {
  const result = await pool.query(
    `UPDATE collections SET name = coalesce($2, name), color = coalesce($3, color),
       updated_at = now() WHERE id = $1`,
    [id, patch.name ?? null, patch.color ?? null],
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Deletes a collection. Its maps are kept (moved out of any collection) unless `deleteMaps`;
 * returns the ids of maps that were deleted.
 */
export async function deleteCollection(id: string, deleteMaps: boolean): Promise<string[] | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let deleted: string[] = [];
    if (deleteMaps) {
      const result = await client.query<{ id: string }>(
        'DELETE FROM maps WHERE collection_id = $1 RETURNING id',
        [id],
      );
      deleted = result.rows.map((row) => row.id);
    }
    const removed = await client.query('DELETE FROM collections WHERE id = $1', [id]);
    await client.query('COMMIT');
    return (removed.rowCount ?? 0) > 0 ? deleted : null;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteMap(id: string): Promise<boolean> {
  const result = await pool.query('DELETE FROM maps WHERE id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}

export async function loadState(id: string): Promise<Uint8Array | null> {
  const result = await pool.query<{ state: Buffer | null }>(
    'SELECT state FROM maps WHERE id = $1',
    [id],
  );
  const state = result.rows[0]?.state;
  return state ? new Uint8Array(state) : null;
}

/**
 * Saves a map's state. Only updates maps that exist, so a deleted map is never resurrected by a
 * late save. Takes an automatic version if the last one is older than the interval.
 */
export async function storeState(id: string, stats: MapStats, state: Uint8Array): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const updated = await client.query(
      `UPDATE maps SET state = $2, title = $3, theme = $4, node_count = $5, updated_at = now()
       WHERE id = $1`,
      [id, Buffer.from(state), stats.title, stats.theme, stats.nodeCount],
    );
    if ((updated.rowCount ?? 0) > 0) {
      const recent = await client.query(
        `SELECT 1 FROM map_versions WHERE map_id = $1
         AND created_at > now() - make_interval(mins => $2) LIMIT 1`,
        [id, AUTO_VERSION_INTERVAL_MINUTES],
      );
      if ((recent.rowCount ?? 0) === 0) {
        await client.query(
          'INSERT INTO map_versions (map_id, label, auto, node_count, state) VALUES ($1, $2, true, $3, $4)',
          [id, 'Autosave', stats.nodeCount, Buffer.from(state)],
        );
        await client.query(
          `DELETE FROM map_versions WHERE map_id = $1 AND auto AND id NOT IN (
             SELECT id FROM map_versions WHERE map_id = $1 AND auto ORDER BY created_at DESC LIMIT $2)`,
          [id, AUTO_VERSIONS_KEPT],
        );
      }
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function listVersions(mapId: string): Promise<VersionRow[]> {
  const result = await pool.query<VersionRow>(
    `SELECT id::text, label, auto, node_count, created_at FROM map_versions
     WHERE map_id = $1 ORDER BY created_at DESC LIMIT 300`,
    [mapId],
  );
  return result.rows;
}

export async function createVersion(
  mapId: string,
  label: string,
  nodeCount: number,
  state: Uint8Array,
): Promise<VersionRow> {
  const result = await pool.query<VersionRow>(
    `INSERT INTO map_versions (map_id, label, auto, node_count, state) VALUES ($1, $2, false, $3, $4)
     RETURNING id::text, label, auto, node_count, created_at`,
    [mapId, label, nodeCount, Buffer.from(state)],
  );
  return result.rows[0]!;
}

export async function getVersionState(
  mapId: string,
  versionId: string,
): Promise<Uint8Array | null> {
  const result = await pool.query<{ state: Buffer }>(
    'SELECT state FROM map_versions WHERE map_id = $1 AND id = $2',
    [mapId, versionId],
  );
  const state = result.rows[0]?.state;
  return state ? new Uint8Array(state) : null;
}

export async function deleteVersion(mapId: string, versionId: string): Promise<boolean> {
  const result = await pool.query('DELETE FROM map_versions WHERE map_id = $1 AND id = $2', [
    mapId,
    versionId,
  ]);
  return (result.rowCount ?? 0) > 0;
}
