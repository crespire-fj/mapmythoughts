import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { addChild, buildMapDoc, setCollapsed } from '../commands/commands';
import { ROOT_ID, readSnapshot, type MapSnapshot } from '../model/schema';
import { computeLayout, H_GAP, ROOT_SIBLING_GAP, SIBLING_GAP, type Size } from './layout';
import { curvedConnector } from '../connectors/connectors';

const ROOT: Size = { width: 200, height: 50 };
const NODE: Size = { width: 100, height: 40 };

function sizesFor(snapshot: MapSnapshot, overrides: Record<string, Size> = {}) {
  const sizes = new Map<string, Size>([[ROOT_ID, ROOT]]);
  for (const id of snapshot.nodes.keys()) sizes.set(id, overrides[id] ?? NODE);
  return sizes;
}

function center(layout: ReturnType<typeof computeLayout>, id: string) {
  const box = layout.nodes.get(id)!.box;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

describe('two-sided horizontal layout', () => {
  it('places a single right child 100 units from the root edge, vertically centred', () => {
    const doc = new Y.Doc();
    const a = addChild(doc, ROOT_ID, { side: 'right' });
    const snapshot = readSnapshot(doc);
    const layout = computeLayout(snapshot, sizesFor(snapshot));
    expect(center(layout, a)).toEqual({ x: ROOT.width / 2 + H_GAP + NODE.width / 2, y: 0 });
    expect(layout.nodes.get(a)!.side).toBe('right');
  });

  it('mirrors left-side branches', () => {
    const doc = new Y.Doc();
    const a = addChild(doc, ROOT_ID, { side: 'left' });
    const snapshot = readSnapshot(doc);
    const layout = computeLayout(snapshot, sizesFor(snapshot));
    expect(center(layout, a).x).toBe(-(ROOT.width / 2 + H_GAP + NODE.width / 2));
  });

  it('separates first-level siblings by 60 and centres them on the root', () => {
    const doc = new Y.Doc();
    const a = addChild(doc, ROOT_ID, { side: 'right' });
    const b = addChild(doc, ROOT_ID, { side: 'right' });
    const snapshot = readSnapshot(doc);
    const layout = computeLayout(snapshot, sizesFor(snapshot));
    const total = 2 * NODE.height + ROOT_SIBLING_GAP;
    expect(center(layout, a).y).toBe(-total / 2 + NODE.height / 2);
    expect(center(layout, b).y).toBe(total / 2 - NODE.height / 2);
  });

  it('reserves each subtree its children height plus 40 gaps and centres children on the parent', () => {
    const doc = new Y.Doc();
    const a = addChild(doc, ROOT_ID, { side: 'right' });
    const kid1 = addChild(doc, a);
    const kid2 = addChild(doc, a);
    const b = addChild(doc, ROOT_ID, { side: 'right' });
    const small: Size = { width: 80, height: 30 };
    const snapshot = readSnapshot(doc);
    const layout = computeLayout(snapshot, sizesFor(snapshot, { [kid1]: small, [kid2]: small }));

    const aSpan = 2 * small.height + SIBLING_GAP; // 100, taller than A itself
    const total = aSpan + ROOT_SIBLING_GAP + NODE.height;
    const aCenter = center(layout, a);
    expect(aCenter.y).toBe(-total / 2 + aSpan / 2);
    expect(center(layout, b).y).toBe(total / 2 - NODE.height / 2);

    const kidX = aCenter.x + NODE.width / 2 + H_GAP + small.width / 2;
    expect(center(layout, kid1)).toEqual({ x: kidX, y: aCenter.y - aSpan / 2 + small.height / 2 });
    expect(center(layout, kid2)).toEqual({ x: kidX, y: aCenter.y + aSpan / 2 - small.height / 2 });
    expect(layout.nodes.get(kid1)!.depth).toBe(2);
  });

  it('treats a collapsed node as a leaf', () => {
    const doc = new Y.Doc();
    const a = addChild(doc, ROOT_ID, { side: 'right' });
    const kid = addChild(doc, a);
    setCollapsed(doc, a, true);
    const snapshot = readSnapshot(doc);
    const layout = computeLayout(snapshot, sizesFor(snapshot));
    expect(layout.nodes.has(kid)).toBe(false);
    expect(center(layout, a).y).toBe(0);
  });

  it('lays out a placeholder in place of excluded (dragged) nodes', () => {
    const doc = new Y.Doc();
    const a = addChild(doc, ROOT_ID, { side: 'right' });
    const b = addChild(doc, ROOT_ID, { side: 'right' });
    const snapshot = readSnapshot(doc);
    const layout = computeLayout(snapshot, sizesFor(snapshot), {
      exclude: new Set([b]),
      phantom: { id: '__ph', parentId: ROOT_ID, side: 'right', index: 0, size: NODE },
    });
    expect(layout.nodes.has(b)).toBe(false);
    expect(center(layout, '__ph').y).toBeLessThan(center(layout, a).y);
  });

  it('lays out 500 nodes quickly', () => {
    const outline = Array.from({ length: 25 }, (_, i) => ({
      text: `Branch ${i}`,
      children: Array.from({ length: 19 }, (_, j) => ({ text: `Leaf ${i}.${j}`, children: [] })),
    }));
    const snapshot = readSnapshot(buildMapDoc('Big map', outline));
    expect(snapshot.nodes.size).toBe(500);
    const sizes = sizesFor(snapshot);
    const start = performance.now();
    for (let i = 0; i < 20; i++) computeLayout(snapshot, sizes);
    const perRun = (performance.now() - start) / 20;
    expect(perRun).toBeLessThan(8);
  });
});

describe('curved connector', () => {
  it('runs from the parent edge to the child edge with 40% control offsets', () => {
    const parent = { x: -100, y: -25, width: 200, height: 50 };
    const child = { x: 200, y: -20, width: 100, height: 40 };
    expect(curvedConnector(parent, child, 'right')).toBe('M 100 0 C 140 0, 160 0, 200 0');
  });

  it('uses at least a 20 unit control offset and mirrors on the left', () => {
    const parent = { x: 0, y: 0, width: 100, height: 40 };
    const child = { x: -30, y: 100, width: 20, height: 20 };
    expect(curvedConnector(parent, child, 'left')).toBe('M 0 20 C -20 20, 10 110, -10 110');
  });
});
