import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import {
  LOCAL_ORIGIN,
  addChild,
  addSibling,
  buildMapDoc,
  deleteNode,
  moveSubtree,
  setCollapsed,
  setStyle,
  setText,
} from './commands';
import { applyTextDiff } from './textDiff';
import { ROOT_ID, childrenOf, getNodes, readSnapshot, siblingsOf } from '../model/schema';

const textOf = (doc: Y.Doc, id: string) => readSnapshot(doc).nodes.get(id)?.text;
const childIds = (doc: Y.Doc, id: string, side?: 'left' | 'right') =>
  childrenOf(readSnapshot(doc), id, side).map((n) => n.id);

describe('adding nodes', () => {
  it('balances first-level nodes between the sides', () => {
    const doc = new Y.Doc();
    const ids = [1, 2, 3, 4].map(() => addChild(doc, ROOT_ID));
    const sides = ids.map((id) => readSnapshot(doc).nodes.get(id)!.side);
    expect(sides).toEqual(['right', 'left', 'right', 'left']);
  });

  it('appends children in order and copies the parent style', () => {
    const doc = new Y.Doc();
    const a = addChild(doc, ROOT_ID);
    setStyle(doc, a, { shape: 'pill', color: '#d0ebff' });
    const k1 = addChild(doc, a);
    const k2 = addChild(doc, a);
    expect(childIds(doc, a)).toEqual([k1, k2]);
    const kid = readSnapshot(doc).nodes.get(k2)!;
    expect([kid.shape, kid.color, kid.side]).toEqual(['pill', '#d0ebff', 'right']);
  });

  it('inserts a sibling directly after the node', () => {
    const doc = new Y.Doc();
    const a = addChild(doc, ROOT_ID, { side: 'right' });
    const c = addChild(doc, ROOT_ID, { side: 'right' });
    const b = addSibling(doc, a);
    expect(childIds(doc, ROOT_ID, 'right')).toEqual([a, b, c]);
  });

  it('keeps a first-level sibling on the same side', () => {
    const doc = new Y.Doc();
    const a = addChild(doc, ROOT_ID, { side: 'left' });
    const b = addSibling(doc, a);
    expect(readSnapshot(doc).nodes.get(b)!.side).toBe('left');
  });

  it('adding a child to a collapsed node expands it', () => {
    const doc = new Y.Doc();
    const a = addChild(doc, ROOT_ID);
    addChild(doc, a);
    setCollapsed(doc, a, true);
    addChild(doc, a);
    expect(readSnapshot(doc).nodes.get(a)!.collapsed).toBe(false);
  });
});

describe('deleting nodes', () => {
  it('removes the whole subtree and selects the previous sibling', () => {
    const doc = new Y.Doc();
    const a = addChild(doc, ROOT_ID, { side: 'right' });
    const b = addChild(doc, ROOT_ID, { side: 'right' });
    const kid = addChild(doc, b);
    addChild(doc, kid);
    expect(deleteNode(doc, b)).toBe(a);
    expect([...readSnapshot(doc).nodes.keys()]).toEqual([a]);
  });

  it('selects the parent when there is no previous sibling', () => {
    const doc = new Y.Doc();
    const a = addChild(doc, ROOT_ID);
    const kid = addChild(doc, a);
    expect(deleteNode(doc, kid)).toBe(a);
    expect(deleteNode(doc, a)).toBe(ROOT_ID);
  });

  it('refuses to delete the root', () => {
    expect(() => deleteNode(new Y.Doc(), ROOT_ID)).toThrow();
  });
});

describe('moving subtrees', () => {
  it('reparents a subtree and keeps its children', () => {
    const doc = new Y.Doc();
    const a = addChild(doc, ROOT_ID, { side: 'right' });
    const b = addChild(doc, ROOT_ID, { side: 'left' });
    const kid = addChild(doc, b);
    expect(moveSubtree(doc, b, { parentId: a, index: 0 })).toBe(true);
    expect(childIds(doc, a)).toEqual([b]);
    expect(childIds(doc, b)).toEqual([kid]);
    expect(readSnapshot(doc).nodes.get(b)!.side).toBe('right');
  });

  it('reorders among siblings', () => {
    const doc = new Y.Doc();
    const [a, b, c] = [1, 2, 3].map(() => addChild(doc, ROOT_ID, { side: 'right' }));
    moveSubtree(doc, c!, { parentId: ROOT_ID, side: 'right', index: 0 });
    expect(childIds(doc, ROOT_ID, 'right')).toEqual([c, a, b]);
  });

  it('moves a branch to the other side of the root', () => {
    const doc = new Y.Doc();
    const a = addChild(doc, ROOT_ID, { side: 'right' });
    moveSubtree(doc, a, { parentId: ROOT_ID, side: 'left', index: 0 });
    expect(childIds(doc, ROOT_ID, 'left')).toEqual([a]);
  });

  it('refuses to move a node into its own subtree', () => {
    const doc = new Y.Doc();
    const a = addChild(doc, ROOT_ID);
    const kid = addChild(doc, a);
    expect(moveSubtree(doc, a, { parentId: kid, index: 0 })).toBe(false);
    expect(moveSubtree(doc, a, { parentId: a, index: 0 })).toBe(false);
  });
});

describe('undo', () => {
  it('undoes each command in one step', () => {
    const doc = new Y.Doc();
    const undo = new Y.UndoManager([getNodes(doc), doc.getText('title')], {
      trackedOrigins: new Set([LOCAL_ORIGIN]),
      captureTimeout: 0,
    });
    const a = addChild(doc, ROOT_ID);
    const kid = addChild(doc, a);
    addChild(doc, kid);
    deleteNode(doc, kid);
    expect(readSnapshot(doc).nodes.size).toBe(1);
    undo.undo();
    expect(readSnapshot(doc).nodes.size).toBe(3);
    undo.undo();
    expect(readSnapshot(doc).nodes.size).toBe(2);
    undo.redo();
    expect(readSnapshot(doc).nodes.size).toBe(3);
  });
});

describe('text', () => {
  it('edits the root title and node text', () => {
    const doc = new Y.Doc();
    setText(doc, ROOT_ID, 'Plan');
    const a = addChild(doc, ROOT_ID);
    setText(doc, a, 'Line one\nLine two');
    const snapshot = readSnapshot(doc);
    expect(snapshot.title).toBe('Plan');
    expect(textOf(doc, a)).toBe('Line one\nLine two');
  });

  it('applies minimal diffs', () => {
    const doc = new Y.Doc();
    const text = doc.getText('t');
    text.insert(0, 'hello world');
    const changes: unknown[] = [];
    text.observe((event) => changes.push(event.delta));
    applyTextDiff(text, 'hello brave world');
    expect(text.toString()).toBe('hello brave world');
    expect(changes).toEqual([[{ retain: 6 }, { insert: 'brave ' }]]);
    applyTextDiff(text, 'hello');
    expect(text.toString()).toBe('hello');
    applyTextDiff(text, '');
    expect(text.toString()).toBe('');
  });
});

describe('building a map from an outline', () => {
  it('creates nested nodes with alternating first-level sides', () => {
    const doc = buildMapDoc('Root', [
      { text: 'A', children: [{ text: 'A1', children: [] }] },
      { text: 'B', children: [] },
    ]);
    const snapshot = readSnapshot(doc);
    expect(snapshot.title).toBe('Root');
    const [a] = childrenOf(snapshot, ROOT_ID, 'right');
    const [b] = childrenOf(snapshot, ROOT_ID, 'left');
    expect([a!.text, b!.text]).toEqual(['A', 'B']);
    expect(childrenOf(snapshot, a!.id).map((n) => n.text)).toEqual(['A1']);
    expect(siblingsOf(snapshot, a!.id)).toHaveLength(1);
  });
});
