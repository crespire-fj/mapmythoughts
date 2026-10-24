import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import {
  LOCAL_ORIGIN,
  addChild,
  buildMapDoc,
  deleteNodes,
  duplicateNodes,
  indentNode,
  insertSubtrees,
  moveAmongSiblings,
  outdentNode,
  replaceContent,
  revealNode,
  serializeSubtrees,
  setCollapsed,
  setLink,
  setNote,
  setSettings,
  setStyle,
  setText,
  showLevels,
} from './commands/commands';
import { elbowConnector, curvedConnector } from './connectors/connectors';
import { exportMarkdown, parseFragment, parseMarkdown } from './export/markdown';
import { computeLayout, V_GAP, type Size } from './layout/layout';
import {
  ROOT_ID,
  childrenOf,
  getNodes,
  getSettings,
  getTitle,
  readSnapshot,
  treeOrder,
} from './model/schema';
import { navigate, structuralMove } from './selection/navigation';
import { THEMES, branchColors, contrastRatio, nodeAppearance, readableText } from './theme/themes';

const texts = (doc: Y.Doc, parent: string, side?: 'left' | 'right') =>
  childrenOf(readSnapshot(doc), parent, side).map((n) => n.text);
const byText = (doc: Y.Doc, text: string) =>
  [...readSnapshot(doc).nodes.values()].find((n) => n.text === text)!.id;

function sample() {
  return buildMapDoc('Root', [
    {
      text: 'A',
      children: [
        { text: 'A1', children: [{ text: 'A1a', children: [] }] },
        { text: 'A2', children: [] },
      ],
    },
    { text: 'B', children: [{ text: 'B1', children: [] }] },
    { text: 'C', children: [] },
  ]);
}

describe('clipboard commands', () => {
  it('serializes subtrees and inserts them elsewhere with notes, links and styles', () => {
    const doc = sample();
    const a = byText(doc, 'A');
    setNote(doc, a, 'Why A matters');
    setLink(doc, a, 'https://example.org');
    setStyle(doc, a, { shape: 'pill', marker: 'done' });
    const copied = serializeSubtrees(readSnapshot(doc), [a, byText(doc, 'A1')]);
    expect(copied).toHaveLength(1); // A1 is inside A, so it isn't copied twice
    expect(copied[0]).toMatchObject({
      text: 'A',
      note: 'Why A matters',
      link: 'https://example.org',
      shape: 'pill',
      marker: 'done',
    });

    const [pasted] = insertSubtrees(doc, byText(doc, 'C'), copied);
    const snapshot = readSnapshot(doc);
    expect(snapshot.nodes.get(pasted!)).toMatchObject({
      text: 'A',
      note: 'Why A matters',
      marker: 'done',
    });
    expect(childrenOf(snapshot, pasted!).map((n) => n.text)).toEqual(['A1', 'A2']);
    expect(snapshot.nodes.size).toBe(7 + 4);
  });

  it('balances pasted first-level branches across both sides', () => {
    const doc = new Y.Doc();
    insertSubtrees(doc, ROOT_ID, parseFragment('one\ntwo\nthree'));
    expect(texts(doc, ROOT_ID, 'right')).toEqual(['one', 'three']);
    expect(texts(doc, ROOT_ID, 'left')).toEqual(['two']);
  });

  it('inserts at an index', () => {
    const doc = sample();
    insertSubtrees(doc, byText(doc, 'A'), [{ text: 'first', children: [] }], { index: 0 });
    expect(texts(doc, byText(doc, 'A'))).toEqual(['first', 'A1', 'A2']);
  });

  it('duplicates a branch right after itself', () => {
    const doc = sample();
    duplicateNodes(doc, [byText(doc, 'A1')]);
    expect(texts(doc, byText(doc, 'A'))).toEqual(['A1', 'A1', 'A2']);
    expect(readSnapshot(doc).nodes.size).toBe(9);
  });
});

describe('structural commands', () => {
  it('deletes several branches and selects a surviving neighbour', () => {
    const doc = sample();
    const next = deleteNodes(doc, [byText(doc, 'A2'), byText(doc, 'A1a'), byText(doc, 'B')]);
    expect(readSnapshot(doc).nodes.get(next)?.text).toBe('A1');
    expect(treeOrder(readSnapshot(doc)).map((id) => readSnapshot(doc).nodes.get(id)!.text)).toEqual(
      ['A', 'A1', 'C'],
    );
  });

  it('reorders among siblings and stops at the ends', () => {
    const doc = sample();
    const a2 = byText(doc, 'A2');
    expect(moveAmongSiblings(doc, a2, -1)).toBe(true);
    expect(texts(doc, byText(doc, 'A'))).toEqual(['A2', 'A1']);
    expect(moveAmongSiblings(doc, a2, -1)).toBe(false);
  });

  it('indents under the previous sibling and outdents to after the parent', () => {
    const doc = sample();
    const a2 = byText(doc, 'A2');
    expect(indentNode(doc, a2)).toBe(true);
    expect(texts(doc, byText(doc, 'A1'))).toEqual(['A1a', 'A2']);
    expect(outdentNode(doc, a2)).toBe(true);
    expect(texts(doc, byText(doc, 'A'))).toEqual(['A1', 'A2']);
    expect(outdentNode(doc, a2)).toBe(true);
    expect(texts(doc, ROOT_ID, 'right')).toEqual(['A', 'A2', 'C']);
    expect(outdentNode(doc, a2)).toBe(false);
    expect(indentNode(doc, byText(doc, 'A'))).toBe(false);
  });

  it('shows a given number of levels and reveals hidden nodes', () => {
    const doc = sample();
    showLevels(doc, 1);
    let snapshot = readSnapshot(doc);
    expect(['A', 'A1', 'B'].map((t) => snapshot.nodes.get(byText(doc, t))!.collapsed)).toEqual([
      true,
      true,
      true,
    ]);
    expect(revealNode(doc, byText(doc, 'A1a'))).toBe(true);
    snapshot = readSnapshot(doc);
    expect(snapshot.nodes.get(byText(doc, 'A'))!.collapsed).toBe(false);
    expect(snapshot.nodes.get(byText(doc, 'A1'))!.collapsed).toBe(false);
    showLevels(doc, Infinity);
    expect([...readSnapshot(doc).nodes.values()].some((n) => n.collapsed)).toBe(false);
  });
});

describe('restoring a version', () => {
  it('replaces content in one undoable step, keeping node identities', () => {
    const doc = sample();
    const version = new Y.Doc();
    Y.applyUpdate(version, Y.encodeStateAsUpdate(doc));
    const undo = new Y.UndoManager([getNodes(doc), getTitle(doc), getSettings(doc)], {
      trackedOrigins: new Set([LOCAL_ORIGIN]),
      captureTimeout: 0,
    });

    const a = byText(doc, 'A');
    setText(doc, ROOT_ID, 'Renamed');
    setText(doc, a, 'A changed');
    addChild(doc, ROOT_ID);
    deleteNodes(doc, [byText(doc, 'B')]);
    setSettings(doc, { theme: 'sunset', orientation: 'vertical' });

    replaceContent(doc, version);
    const restored = readSnapshot(doc);
    expect(restored.title).toBe('Root');
    expect(restored.nodes.get(a)?.text).toBe('A');
    expect(restored.nodes.size).toBe(7);
    expect(restored.settings).toEqual(readSnapshot(version).settings);

    undo.undo();
    expect(readSnapshot(doc).title).toBe('Renamed');
    expect(readSnapshot(doc).settings.theme).toBe('sunset');
  });
});

describe('vertical layout and connectors', () => {
  it('places children below the root (and above for the other side)', () => {
    const doc = buildMapDoc(
      'Root',
      [
        { text: 'Down', children: [] },
        { text: 'Up', children: [] },
      ],
      {
        orientation: 'vertical',
      },
    );
    const snapshot = readSnapshot(doc);
    const sizes = new Map<string, Size>([[ROOT_ID, { width: 200, height: 50 }]]);
    for (const id of snapshot.nodes.keys()) sizes.set(id, { width: 100, height: 40 });
    const layout = computeLayout(snapshot, sizes);
    expect(layout.root).toEqual({ x: -100, y: -25, width: 200, height: 50 });
    const down = layout.nodes.get(byText(doc, 'Down'))!.box;
    const up = layout.nodes.get(byText(doc, 'Up'))!.box;
    expect(down).toEqual({ x: -50, y: 25 + V_GAP, width: 100, height: 40 });
    expect(up).toEqual({ x: -50, y: -25 - V_GAP - 40, width: 100, height: 40 });
  });

  it('draws vertical curves between bottom and top edges', () => {
    const parent = { x: -100, y: -25, width: 200, height: 50 };
    const child = { x: -50, y: 125, width: 100, height: 40 };
    expect(curvedConnector(parent, child, 'right', 'vertical')).toBe('M 0 25 C 0 65, 0 85, 0 125');
  });

  it('draws elbow connectors with a shared trunk and rounded corners', () => {
    const parent = { x: 0, y: 0, width: 100, height: 40 };
    const child = { x: 200, y: 100, width: 100, height: 40 };
    expect(elbowConnector(parent, child, 'right')).toBe(
      'M 100 20 L 142 20 Q 150 20 150 28 L 150 112 Q 150 120 158 120 L 200 120',
    );
    // aligned nodes get a straight line
    expect(elbowConnector(parent, { ...child, y: 0 }, 'right')).toBe('M 100 20 L 200 20');
  });

  it('maps arrow keys to the vertical tree', () => {
    const doc = buildMapDoc(
      'Root',
      [
        {
          text: 'A',
          children: [
            { text: 'A1', children: [] },
            { text: 'A2', children: [] },
          ],
        },
      ],
      {
        orientation: 'vertical',
      },
    );
    const s = readSnapshot(doc);
    const layout = computeLayout(s, new Map());
    expect(navigate(s, layout, ROOT_ID, 'down')?.target).toBe(byText(doc, 'A'));
    expect(navigate(s, layout, byText(doc, 'A'), 'down')?.target).toBe(byText(doc, 'A1'));
    expect(navigate(s, layout, byText(doc, 'A1'), 'right')?.target).toBe(byText(doc, 'A2'));
    expect(navigate(s, layout, byText(doc, 'A1'), 'up')?.target).toBe(byText(doc, 'A'));
    expect(structuralMove('right', 'horizontal', 'right')).toBe('indent');
    expect(structuralMove('right', 'horizontal', 'left')).toBe('outdent');
    expect(structuralMove('up', 'horizontal', 'left')).toBe('earlier');
    expect(structuralMove('down', 'vertical', 'right')).toBe('indent');
    expect(structuralMove('left', 'vertical', 'right')).toBe('earlier');
  });
});

describe('themes', () => {
  it('gives every branch colour text with at least 4.5:1 contrast', () => {
    for (const theme of Object.values(THEMES)) {
      for (const color of [...theme.branches, theme.root[0]]) {
        expect(
          contrastRatio(color, readableText(color)),
          `${theme.id} ${color}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('keeps tinted and outlined nodes readable in light and dark mode', () => {
    for (const theme of Object.values(THEMES)) {
      for (const branch of theme.branches) {
        for (const mode of ['light', 'dark'] as const) {
          for (const depth of [2, 3]) {
            const look = nodeAppearance('auto', 'rounded', depth, branch, mode);
            expect(
              contrastRatio(look.background, look.text),
              `${theme.id} ${branch} ${mode} ${depth}`,
            ).toBeGreaterThanOrEqual(4.5);
          }
        }
      }
    }
  });

  it('colours each first-level branch and its descendants alike', () => {
    const doc = sample();
    const colors = branchColors(readSnapshot(doc), THEMES.lagoon);
    expect(colors.get(byText(doc, 'A1a'))).toBe(colors.get(byText(doc, 'A')));
    expect(colors.get(byText(doc, 'A'))).not.toBe(colors.get(byText(doc, 'B')));
  });
});

describe('markdown notes, links and fragments', () => {
  it('round-trips notes and links', () => {
    const doc = buildMapDoc('Plan', [{ text: 'Goal', children: [] }]);
    const goal = byText(doc, 'Goal');
    setNote(doc, goal, 'First line\nSecond line');
    setLink(doc, goal, 'https://spc.int');
    const markdown = exportMarkdown(readSnapshot(doc));
    expect(markdown).toBe('# Plan\n\n- [Goal](https://spc.int)\n  > First line\n  > Second line\n');
    expect(parseMarkdown(markdown).outline).toEqual([
      { text: 'Goal', link: 'https://spc.int', note: 'First line\nSecond line', children: [] },
    ]);
  });

  it('turns pasted lines and bullets into branches', () => {
    expect(parseFragment('Alpha')).toEqual([{ text: 'Alpha', children: [] }]);
    expect(parseFragment('# Heading\n- a\n  - b\nplain')).toEqual([
      { text: 'Heading', children: [] },
      { text: 'a', children: [{ text: 'b', children: [] }] },
      { text: 'plain', children: [] },
    ]);
  });
});

describe('collapse', () => {
  it('toggles', () => {
    const doc = sample();
    const a = byText(doc, 'A');
    expect(setCollapsed(doc, a)).toBe(true);
    expect(setCollapsed(doc, a)).toBe(false);
  });
});
