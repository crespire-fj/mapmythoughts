import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import {
  LOCAL_ORIGIN,
  addLink,
  buildMapDoc,
  buildMapFromBranch,
  countOccurrences,
  replaceBranchWithLink,
  replaceText,
  type OutlineNode,
} from './commands/commands';
import { openItems } from './editor/panels/OpenItemsPanel';
import { internalLink, parseInternalLink, safeUrl } from './editor/url';
import { resolveDropTarget } from './editor/dragDrop';
import { STEP_GAP, computeLayout, intersects, type LayoutResult } from './layout/layout';
import { ROOT_ID, getLinks, getNodes, readSnapshot, type MapSnapshot } from './model/schema';
import { navigate } from './selection/navigation';

const n = (text: string, ...children: OutlineNode[]): OutlineNode => ({ text, children });
const steps = (text: string, ...children: OutlineNode[]): OutlineNode => ({
  text,
  children,
  steps: true,
});

function setup(outline: OutlineNode[], orientation: 'horizontal' | 'vertical' = 'horizontal') {
  const doc = buildMapDoc('Root', outline, { orientation });
  const snapshot = readSnapshot(doc);
  const layout = computeLayout(snapshot, new Map());
  const id = (text: string) => [...snapshot.nodes.values()].find((x) => x.text === text)!.id;
  const box = (text: string) => layout.nodes.get(id(text))!.box;
  return { doc, snapshot, layout, id, box };
}

function overlaps(layout: LayoutResult): string[] {
  const all = [...layout.nodes.values()];
  const hits: string[] = [];
  for (const [i, a] of all.entries()) {
    if (intersects(a.box, layout.root)) hits.push(`${a.id}/root`);
    for (const b of all.slice(i + 1)) if (intersects(a.box, b.box)) hits.push(`${a.id}/${b.id}`);
  }
  return hits;
}

describe('steps layout', () => {
  const process = [steps('Apply', n('Submit', n('Review', n('Decide')))), n('Other')];

  it('stacks a chain straight down under the steps node', () => {
    const { layout, box, id } = setup(process);
    const centre = (b: { x: number; width: number }) => b.x + b.width / 2;
    expect(box('Submit').y).toBe(box('Apply').y + box('Apply').height + STEP_GAP);
    expect(box('Review').y).toBe(box('Submit').y + box('Submit').height + STEP_GAP);
    expect(centre(box('Decide'))).toBeCloseTo(centre(box('Apply')));
    expect(layout.nodes.get(id('Apply'))).toMatchObject({
      flow: 'horizontal',
      childFlow: 'vertical',
    });
    expect(layout.nodes.get(id('Submit'))).toMatchObject({ flow: 'vertical', flowSide: 'right' });
  });

  it('puts parallel steps side by side and keeps every node clear of the others', () => {
    const { layout, box } = setup([
      steps('Review', n('Approved', n('Register')), n('Not approved', n('Appeal', n('Committee')))),
      n('Sibling below'),
      n('Left branch', n('Leaf')),
    ]);
    expect(box('Approved').y).toBe(box('Not approved').y);
    expect(box('Approved').x + box('Approved').width).toBeLessThan(box('Not approved').x);
    expect(overlaps(layout)).toEqual([]);
  });

  it('flows across instead of down in a top-and-bottom map', () => {
    const { box, layout } = setup(process, 'vertical');
    expect(box('Submit').x).toBe(box('Apply').x + box('Apply').width + STEP_GAP);
    expect(overlaps(layout)).toEqual([]);
  });

  it('a collapsed steps node is laid out like any other', () => {
    const doc = buildMapDoc('Root', [{ ...steps('Apply', n('Submit')), collapsed: true }]);
    const snapshot = readSnapshot(doc);
    const layout = computeLayout(snapshot, new Map());
    expect([...layout.nodes.values()].map((x) => x.childFlow)).toEqual(['horizontal']);
  });

  it('steps nested inside a steps branch change nothing', () => {
    const plain = setup([steps('A', n('B', n('C')))]);
    const nested = setup([steps('A', steps('B', n('C')))]);
    expect(nested.box('C')).toEqual(plain.box('C'));
  });
});

describe('keys and drops inside a steps branch', () => {
  // first-level branches alternate sides: Apply and Other on the right, Left on the left
  const { snapshot, layout, id } = setup([
    steps('Apply', n('Submit', n('Approved'), n('Rejected'))),
    n('Left'),
    n('Other'),
  ]);
  const go = (from: string, key: 'up' | 'down' | 'left' | 'right') =>
    navigate(snapshot, layout, id(from), key)?.target;

  it('↓ is the next step, ↑ goes back, ←/→ move between parallel steps', () => {
    expect(go('Apply', 'right')).toBe(id('Submit')); // into the branch, as for any node
    expect(go('Apply', 'down')).toBe(id('Other')); // the steps node's own siblings
    expect(go('Submit', 'down')).toBe(id('Approved'));
    expect(go('Approved', 'up')).toBe(id('Submit'));
    expect(go('Submit', 'up')).toBe(id('Apply'));
    expect(go('Approved', 'right')).toBe(id('Rejected'));
    expect(go('Rejected', 'left')).toBe(id('Approved'));
  });

  it('dropping between parallel steps orders by left-to-right position', () => {
    const rejected = layout.nodes.get(id('Rejected'))!.box;
    const target = resolveDropTarget(snapshot as MapSnapshot, layout, id('Approved'), {
      x: rejected.x + rejected.width + 40,
      y: rejected.y - 60,
    });
    expect(target).toMatchObject({ parentId: id('Submit'), index: 1 });
  });
});

describe('links inside the app', () => {
  it('keeps map and node links relative and refuses anything unsafe', () => {
    expect(internalLink('m1')).toBe('#/map/m1');
    expect(internalLink('m1', 'n-2')).toBe('#/map/m1/node/n-2');
    expect(parseInternalLink('#/map/m1/node/n-2')).toEqual({ mapId: 'm1', nodeId: 'n-2' });
    expect(parseInternalLink('#/map/m1')).toEqual({ mapId: 'm1', nodeId: null });
    expect(parseInternalLink('#/guide')).toBeNull();
    expect(safeUrl('  #/map/m1 ')).toBe('#/map/m1');
    expect(safeUrl('spc.int')).toBe('https://spc.int/');
    expect(safeUrl('javascript:alert(1)')).toBe('');
  });
});

describe('moving a branch to its own map', () => {
  const setupBranch = () => {
    const doc = buildMapDoc('Plan', [
      steps('Appeals', n('Fill form', n('Committee')), {
        ...n('Minister'),
        note: 'Within 12 days',
      }),
      n('Other'),
    ]);
    const s = readSnapshot(doc);
    const id = (text: string) => [...s.nodes.values()].find((x) => x.text === text)!.id;
    addLink(doc, id('Committee'), id('Minister')); // inside the branch
    addLink(doc, id('Other'), id('Committee')); // crosses out of it
    return { doc, id };
  };

  it('builds a map with the branch as its centre, notes, steps and inner cross-links', () => {
    const { doc, id } = setupBranch();
    const copy = readSnapshot(
      buildMapFromBranch(readSnapshot(doc), id('Appeals'), { theme: 'spc' }),
    );
    expect(copy.title).toBe('Appeals');
    expect(copy.settings.theme).toBe('spc');
    const texts = [...copy.nodes.values()].map((x) => x.text).sort();
    expect(texts).toEqual(['Committee', 'Fill form', 'Minister']);
    const byText = (t: string) => [...copy.nodes.values()].find((x) => x.text === t)!;
    expect(byText('Minister').note).toBe('Within 12 days');
    expect(byText('Fill form').steps).toBe(true); // the branch flowed as steps; it still does
    expect(copy.links).toHaveLength(1);
    expect(copy.links[0]).toMatchObject({
      from: byText('Committee').id,
      to: byText('Minister').id,
    });
  });

  it('replaces the branch with a link to the new map, as one undo step', () => {
    const { doc, id } = setupBranch();
    const undo = new Y.UndoManager([getNodes(doc), getLinks(doc)], {
      trackedOrigins: new Set([LOCAL_ORIGIN]),
      captureTimeout: 0,
    });
    const appeals = id('Appeals');
    replaceBranchWithLink(doc, appeals, internalLink('new-map'));
    const after = readSnapshot(doc);
    expect([...after.nodes.values()].map((x) => x.text).sort()).toEqual(['Appeals', 'Other']);
    expect(after.nodes.get(appeals)).toMatchObject({ link: '#/map/new-map', steps: false });
    expect(after.links).toHaveLength(0);
    undo.undo();
    expect(readSnapshot(doc).nodes.size).toBe(5);
    expect(readSnapshot(doc).links).toHaveLength(2);
  });
});

describe('find and replace', () => {
  const doc = () =>
    buildMapDoc('Appvoved plan', [
      { ...n('Appvoved', n('Not appvoved')), note: 'appvoved by the CEO' },
      n('Rejected'),
    ]);

  it('counts and replaces every case-insensitive occurrence, in titles and notes too', () => {
    const d = doc();
    expect(countOccurrences(readSnapshot(d), 'appvoved')).toBe(4);
    expect(replaceText(d, 'APPVOVED', 'Approved')).toBe(4);
    const s = readSnapshot(d);
    expect(s.title).toBe('Approved plan');
    expect([...s.nodes.values()].map((x) => x.text).sort()).toEqual([
      'Approved',
      'Not Approved',
      'Rejected',
    ]);
    expect([...s.nodes.values()].find((x) => x.note)!.note).toBe('Approved by the CEO');
  });

  it('can be limited to some nodes, treats the text literally, and undoes in one step', () => {
    const d = doc();
    const undo = new Y.UndoManager([getNodes(d), d.getText('title')], {
      trackedOrigins: new Set([LOCAL_ORIGIN]),
      captureTimeout: 0,
    });
    const target = [...readSnapshot(d).nodes.values()].find((x) => x.text === 'Not appvoved')!;
    expect(replaceText(d, 'appvoved', 'approved', [target.id])).toBe(1);
    expect(readSnapshot(d).title).toBe('Appvoved plan');
    expect(replaceText(d, '.*', 'x')).toBe(0); // no pattern magic
    expect(replaceText(d, 'appvoved', 'Approved')).toBe(3);
    undo.undo();
    expect(countOccurrences(readSnapshot(d), 'appvoved')).toBe(3);
    expect(replaceText(d, '', 'x', [ROOT_ID])).toBe(0);
  });
});

describe('open items', () => {
  it('lists questions, to-dos and the like in reading order, with where they sit', () => {
    const d = buildMapDoc('Plan', [
      n('Review', { ...n('How does this work?'), marker: 'question', note: 'Ask Gibson' }),
      { ...n('Done already'), marker: 'done' },
      { ...n('Write report'), marker: 'todo' },
    ]);
    const items = openItems(readSnapshot(d), 'm1');
    expect(items.map((i) => [i.marker, i.text, i.path.join(' › ')])).toEqual([
      ['question', 'How does this work?', 'Review'],
      ['todo', 'Write report', ''],
    ]);
    expect(items[0]).toMatchObject({ mapId: 'm1', mapTitle: 'Plan', note: 'Ask Gibson' });
  });
});
