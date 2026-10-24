import * as Y from 'yjs';
import type { MapStats } from './db.ts';

// Must match src/model/schema.ts.
const TITLE_KEY = 'title';
const NODES_KEY = 'nodes';
const SETTINGS_KEY = 'settings';

export function statsOf(doc: Y.Doc): MapStats {
  return {
    title: doc.getText(TITLE_KEY).toString().trim().slice(0, 500),
    theme: String(doc.getMap(SETTINGS_KEY).get('theme') ?? 'lagoon'),
    nodeCount: doc.getMap(NODES_KEY).size,
  };
}

export function docFromState(state: Uint8Array): Y.Doc {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, state);
  return doc;
}
