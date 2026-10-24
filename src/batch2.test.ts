import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import {
  LOCAL_ORIGIN,
  addLink,
  buildMapDoc,
  deleteLink,
  deleteNodes,
  replaceContent,
  setLinkLabel,
} from './commands/commands';
import { crossLink } from './connectors/connectors';
import { focusSnapshot } from './editor/focus';
import { MapFileError, buildMapFile, isMapFile, parseMapFile } from './export/mapfile';
import { buildThumbnail } from './export/thumbnail';
import { computeLayout } from './layout/layout';
import { ROOT_ID, childrenOf, getLinks, getNodes, readSnapshot } from './model/schema';
import { THEMES } from './theme/themes';

function sample() {
  return buildMapDoc('Root', [
    {
      text: 'A',
      children: [
        { text: 'A1', children: [{ text: 'A1a', children: [] }] },
        { text: 'A2', children: [] },
        { text: 'A3', children: [] },
      ],
    },
    { text: 'B', children: [] },
  ]);
}
const idOf = (doc: Y.Doc, text: string) =>
  [...readSnapshot(doc).nodes.values()].find((n) => n.text === text)!.id;

describe('cross-links', () => {
  it('links two nodes once, labels them, and refuses self-links and duplicates', () => {
    const doc = sample();
    const a1 = idOf(doc, 'A1');
    const b = idOf(doc, 'B');
    const id = addLink(doc, a1, b)!;
    expect(id).toBeTruthy();
    expect(addLink(doc, b, a1)).toBeNull();
    expect(addLink(doc, a1, a1)).toBeNull();
    expect(addLink(doc, ROOT_ID, b)).toBeTruthy();
    setLinkLabel(doc, id, '  affects   budget ');
    expect(readSnapshot(doc).links.find((l) => l.id === id)).toMatchObject({
      from: a1,
      to: b,
      label: 'affects budget',
    });
    deleteLink(doc, id);
    expect(readSnapshot(doc).links).toHaveLength(1);
  });

  it('removes links when either end is deleted, and undo brings both back', () => {
    const doc = sample();
    const undo = new Y.UndoManager([getNodes(doc), getLinks(doc)], {
      trackedOrigins: new Set([LOCAL_ORIGIN]),
      captureTimeout: 0,
    });
    addLink(doc, idOf(doc, 'A1a'), idOf(doc, 'B'));
    deleteNodes(doc, [idOf(doc, 'A1')]); // deletes A1a with it
    expect(getLinks(doc).size).toBe(0);
    undo.undo();
    expect(readSnapshot(doc).links).toHaveLength(1);
  });

  it('restoring a version restores its links', () => {
    const doc = sample();
    addLink(doc, idOf(doc, 'A'), idOf(doc, 'B'));
    const version = new Y.Doc();
    Y.applyUpdate(version, Y.encodeStateAsUpdate(doc));
    getLinks(doc).clear();
    replaceContent(doc, version);
    expect(readSnapshot(doc).links).toHaveLength(1);
  });

  it('curves from edge to edge with the label in the middle', () => {
    const geometry = crossLink(
      { x: 0, y: 0, width: 100, height: 40 },
      { x: 300, y: 0, width: 100, height: 40 },
      0,
    );
    expect(geometry.path.startsWith('M 100 20 Q')).toBe(true);
    expect(geometry.path.endsWith('300 20')).toBe(true);
    expect(geometry.middle.x).toBeCloseTo(200);
    expect(geometry.middle.y).toBeGreaterThan(20); // bulges to one side
  });
});

describe('focus view', () => {
  it('makes the focused node the root and spreads its children over both sides', () => {
    const doc = sample();
    const full = readSnapshot(doc);
    const a = idOf(doc, 'A');
    addLink(doc, a, idOf(doc, 'A2'));
    addLink(doc, idOf(doc, 'A1'), idOf(doc, 'B')); // B is outside the focus
    const view = focusSnapshot(readSnapshot(doc), a);
    expect(view.title).toBe('A');
    expect(childrenOf(view, ROOT_ID, 'right').map((n) => n.text)).toEqual(['A1', 'A3']);
    expect(childrenOf(view, ROOT_ID, 'left').map((n) => n.text)).toEqual(['A2']);
    expect(childrenOf(view, idOf(doc, 'A1')).map((n) => n.text)).toEqual(['A1a']);
    expect(view.nodes.has(idOf(doc, 'B'))).toBe(false);
    expect(view.links).toEqual([expect.objectContaining({ from: ROOT_ID, to: idOf(doc, 'A2') })]);
    expect(full.nodes.get(idOf(doc, 'A1'))!.parentId).toBe(a); // the real snapshot is untouched
    expect(() => computeLayout(view, new Map())).not.toThrow();
  });
});

describe('.eqapmap files', () => {
  it('round-trips maps with their collection, and every detail of the document', () => {
    const doc = sample();
    addLink(doc, idOf(doc, 'A'), idOf(doc, 'B'));
    const text = buildMapFile([
      {
        title: 'Root',
        state: Y.encodeStateAsUpdate(doc),
        thumbnail: '<svg></svg>',
        collection: { name: 'FEMS', color: '#f26b5b' },
      },
    ]);
    const [parsed] = parseMapFile(text);
    expect(parsed).toMatchObject({
      title: 'Root',
      thumbnail: '<svg></svg>',
      collection: { name: 'FEMS', color: '#f26b5b' },
    });
    const copy = new Y.Doc();
    Y.applyUpdate(copy, parsed!.state);
    expect(readSnapshot(copy).nodes.size).toBe(6);
    expect(readSnapshot(copy).links).toHaveLength(1);
  });

  it('writes the new format and still reads files from before the rename', () => {
    const doc = sample();
    const text = buildMapFile([
      { title: 'Root', state: Y.encodeStateAsUpdate(doc), thumbnail: null, collection: null },
    ]);
    expect(JSON.parse(text).format).toBe('mapmythoughts');
    const legacy = text.replace('"mapmythoughts"', '"eqapmap"');
    expect(parseMapFile(legacy)[0]!.title).toBe('Root');
    expect(isMapFile('Plan.mmt', '')).toBe(true);
    expect(isMapFile('Plan.EQAPMAP', '')).toBe(true);
    expect(isMapFile('notes.md', '# Plan')).toBe(false);
  });

  it('rejects other files with a clear message', () => {
    expect(() => parseMapFile('not json')).toThrow(MapFileError);
    expect(() => parseMapFile('{"format":"other","maps":[]}')).toThrow(
      'not a Map My Thoughts file',
    );
    expect(() => parseMapFile('{"format":"eqapmap","version":99,"maps":[{}]}')).toThrow(
      'newer version',
    );
    expect(() => parseMapFile('{"format":"eqapmap","version":1,"maps":[{"state":"%%%"}]}')).toThrow(
      'damaged',
    );
  });
});

describe('thumbnails', () => {
  it('draws shapes in theme colours without text, scripts or links', () => {
    const doc = sample();
    const snapshot = readSnapshot(doc);
    const svg = buildThumbnail(snapshot, computeLayout(snapshot, new Map()));
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain(THEMES.lagoon.branches[0]!);
    expect(svg).not.toMatch(/<text|<script|href=|\son[a-z]+=/i);
    expect(svg.match(/<rect /g)?.length).toBe(6 + 1); // six nodes and the root
  });
});
