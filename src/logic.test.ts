import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { addChild, buildMapDoc, setCollapsed, setText } from './commands/commands';
import { exportMarkdown, parseMarkdown } from './export/markdown';
import { ShortcutRegistry, matches, type KeyEventLike } from './keyboard/registry';
import { computeLayout } from './layout/layout';
import { ROOT_ID, readSnapshot } from './model/schema';
import { navigate } from './selection/navigation';

function key(k: string, mods: Partial<KeyEventLike> = {}): KeyboardEvent {
  let prevented = false;
  return {
    key: k,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    isComposing: false,
    keyCode: 0,
    ...mods,
    preventDefault: () => {
      prevented = true;
    },
    stopPropagation: () => {},
    get defaultPrevented() {
      return prevented;
    },
  } as unknown as KeyboardEvent;
}

describe('shortcut registry', () => {
  it('matches modifiers exactly and printable characters', () => {
    expect(matches({ key: 'Enter', run: () => {} }, key('Enter'))).toBe(true);
    expect(matches({ key: 'Enter', run: () => {} }, key('Enter', { metaKey: true }))).toBe(false);
    expect(matches({ key: 'z', mod: true, run: () => {} }, key('z', { ctrlKey: true }))).toBe(true);
    expect(
      matches(
        { key: 'z', mod: true, shift: true, run: () => {} },
        key('Z', { metaKey: true, shiftKey: true }),
      ),
    ).toBe(true);
    expect(matches({ key: 'printable', run: () => {} }, key('a'))).toBe(true);
    expect(matches({ key: 'printable', run: () => {} }, key('A', { shiftKey: true }))).toBe(true);
    expect(matches({ key: 'printable', run: () => {} }, key('Tab'))).toBe(false);
    expect(matches({ key: 'printable', run: () => {} }, key('a', { metaKey: true }))).toBe(false);
  });

  it('asks the newest consumer first and respects editing mode', () => {
    const registry = new ShortcutRegistry();
    const calls: string[] = [];
    registry.register({
      name: 'old',
      bindings: [{ key: 'Tab', run: () => void calls.push('old') }],
    });
    const off = registry.register({
      name: 'new',
      bindings: [{ key: 'Tab', whileEditing: true, run: () => void calls.push('new') }],
    });
    const event = key('Tab');
    expect(registry.handle(event, { editing: false })).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    off();
    expect(registry.handle(key('Tab'), { editing: true })).toBe(false);
    registry.handle(key('Tab'), { editing: false });
    expect(calls).toEqual(['new', 'old']);
  });

  it('passes on when a binding returns false, and ignores IME composition', () => {
    const registry = new ShortcutRegistry();
    const calls: string[] = [];
    registry.register({ name: 'a', bindings: [{ key: 'x', run: () => void calls.push('a') }] });
    registry.register({ name: 'b', bindings: [{ key: 'x', run: () => (calls.push('b'), false) }] });
    registry.handle(key('x'), { editing: false });
    expect(calls).toEqual(['b', 'a']);
    expect(registry.handle(key('x', { isComposing: true }), { editing: false })).toBe(false);
  });
});

describe('arrow navigation', () => {
  function setup() {
    const doc = new Y.Doc();
    const r1 = addChild(doc, ROOT_ID, { side: 'right' });
    const r2 = addChild(doc, ROOT_ID, { side: 'right' });
    const l1 = addChild(doc, ROOT_ID, { side: 'left' });
    const k1 = addChild(doc, r1);
    const lk = addChild(doc, l1);
    const snapshot = () => readSnapshot(doc);
    const nav = (from: string, dir: 'up' | 'down' | 'left' | 'right') => {
      const s = snapshot();
      return navigate(s, computeLayout(s, new Map()), from, dir);
    };
    return { doc, r1, r2, l1, k1, lk, nav };
  }

  it('goes from the root to the first branch on each side', () => {
    const { r1, l1, nav } = setup();
    expect(nav(ROOT_ID, 'right')?.target).toBe(r1);
    expect(nav(ROOT_ID, 'left')?.target).toBe(l1);
    expect(nav(ROOT_ID, 'up')).toBeNull();
  });

  it('moves to children, parent and siblings on the right side', () => {
    const { r1, r2, k1, nav } = setup();
    expect(nav(r1, 'right')?.target).toBe(k1);
    expect(nav(k1, 'left')?.target).toBe(r1);
    expect(nav(r1, 'left')?.target).toBe(ROOT_ID);
    expect(nav(r1, 'down')?.target).toBe(r2);
    expect(nav(r2, 'up')?.target).toBe(r1);
    expect(nav(r2, 'down')).toBeNull();
  });

  it('mirrors directions on the left side', () => {
    const { l1, lk, nav } = setup();
    expect(nav(l1, 'left')?.target).toBe(lk);
    expect(nav(lk, 'right')?.target).toBe(l1);
    expect(nav(l1, 'right')?.target).toBe(ROOT_ID);
  });

  it('asks to expand a collapsed node before entering it', () => {
    const { doc, r1, k1, nav } = setup();
    setCollapsed(doc, r1, true);
    expect(nav(r1, 'right')).toEqual({ target: k1, expand: r1 });
  });
});

describe('markdown outline', () => {
  it('round-trips titles, nesting and multi-line text', () => {
    const doc = buildMapDoc('Strategy', [
      { text: 'Goals', children: [{ text: 'Literacy\nand numeracy', children: [] }] },
      { text: 'Risks', children: [] },
    ]);
    const markdown = exportMarkdown(readSnapshot(doc));
    expect(markdown).toBe('# Strategy\n\n- Goals\n  - Literacy\n    and numeracy\n- Risks\n');
    expect(parseMarkdown(markdown)).toEqual({
      title: 'Strategy',
      outline: [
        { text: 'Goals', children: [{ text: 'Literacy\nand numeracy', children: [] }] },
        { text: 'Risks', children: [] },
      ],
    });
  });

  it('accepts tabs, numbered items and a single top-level item as the root', () => {
    expect(parseMarkdown('* Root\n\t1. One\n\t\t- One.a\n\t2. Two')).toEqual({
      title: 'Root',
      outline: [
        { text: 'One', children: [{ text: 'One.a', children: [] }] },
        { text: 'Two', children: [] },
      ],
    });
  });

  it('exports right-side branches before left-side ones', () => {
    const doc = new Y.Doc();
    setText(doc, ROOT_ID, 'T');
    const left = addChild(doc, ROOT_ID, { side: 'left' });
    setText(doc, left, 'L');
    const right = addChild(doc, ROOT_ID, { side: 'right' });
    setText(doc, right, 'R');
    expect(exportMarkdown(readSnapshot(doc))).toBe('# T\n\n- R\n- L\n');
  });
});
