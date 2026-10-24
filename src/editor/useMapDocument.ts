import { useEffect, useState } from 'react';
import * as Y from 'yjs';
import { HocuspocusProvider, WebSocketStatus } from '@hocuspocus/provider';
import { LOCAL_ORIGIN, VIEW_ORIGIN, upgradeDocument } from '../commands/commands';
import { ApiError, api, syncUrl } from '../maps/api';
import {
  getLinks,
  getNodes,
  getSettings,
  getTitle,
  readSnapshot,
  type MapSnapshot,
} from '../model/schema';

export type SaveStatus = 'loading' | 'saved' | 'saving' | 'offline' | 'missing' | 'error';

export interface MapDocument {
  doc: Y.Doc;
  undo: Y.UndoManager;
  snapshot: MapSnapshot;
  status: SaveStatus;
}

/**
 * Opens a map: checks it exists, connects it to the sync server, and re-reads a snapshot (at
 * most once per frame) whenever the document changes.
 */
export function useMapDocument(mapId: string): MapDocument | { status: SaveStatus } {
  const [opened, setOpened] = useState<{
    id: string;
    doc: Y.Doc;
    undo: Y.UndoManager;
  } | null>(null);
  const [snapshot, setSnapshot] = useState<MapSnapshot | null>(null);
  const [status, setStatus] = useState<SaveStatus>('loading');

  useEffect(() => {
    let cancelled = false;
    let frame = 0;
    const doc = new Y.Doc();
    // A long capture timeout plus explicit stopCapturing() calls makes each command, and each
    // text-editing session, exactly one undo step.
    const undo = new Y.UndoManager(
      [getNodes(doc), getTitle(doc), getSettings(doc), getLinks(doc)],
      {
        trackedOrigins: new Set([LOCAL_ORIGIN]),
        captureTimeout: 10 * 60 * 1000,
      },
    );
    let provider: HocuspocusProvider | null = null;
    let connected = false;
    let unsynced = 0;
    const updateStatus = () => {
      if (!cancelled) setStatus(!connected ? 'offline' : unsynced > 0 ? 'saving' : 'saved');
    };
    // Local commands and undo/redo update the snapshot in the same render as the selection change
    // they cause; remote updates are batched to one re-read per frame.
    const refresh = (_update: Uint8Array, origin: unknown) => {
      cancelAnimationFrame(frame);
      if (origin === LOCAL_ORIGIN || origin === VIEW_ORIGIN || origin === undo) {
        if (!cancelled) setSnapshot(readSnapshot(doc));
        return;
      }
      frame = requestAnimationFrame(() => {
        if (!cancelled) setSnapshot(readSnapshot(doc));
      });
    };

    setStatus('loading');
    setSnapshot(null);
    api
      .get(mapId)
      .then(() => {
        if (cancelled) return;
        provider = new HocuspocusProvider({
          url: syncUrl(),
          name: mapId,
          document: doc,
          onStatus: ({ status: next }) => {
            connected = next === WebSocketStatus.Connected;
            updateStatus();
          },
          onSynced: () => {
            if (cancelled) return;
            upgradeDocument(doc);
            setOpened({ id: mapId, doc, undo });
            setSnapshot(readSnapshot(doc));
            doc.on('update', refresh);
            updateStatus();
          },
        });
        provider.on('unsyncedChanges', ({ number }: { number: number }) => {
          unsynced = number;
          updateStatus();
        });
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setStatus(error instanceof ApiError && error.status === 404 ? 'missing' : 'error');
      });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      doc.off('update', refresh);
      provider?.destroy();
      undo.destroy();
      doc.destroy();
    };
  }, [mapId]);

  if (!opened || opened.id !== mapId || !snapshot) {
    return { status: status === 'saved' || status === 'saving' ? 'loading' : status };
  }
  return { doc: opened.doc, undo: opened.undo, snapshot, status };
}
