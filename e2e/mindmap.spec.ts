import { expect, node, outline, selected, test, waitSaved, type Tree } from './fixtures';

const MOD = 'ControlOrMeta';

test('builds a map with Tab, Enter, line breaks and Escape', async ({ page, track }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New map' }).click();
  track(page);
  await expect(node(page, 'Central topic')).toBeVisible();

  // Typing on a selected node replaces its text.
  await page.keyboard.type('Education plan');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Literacy');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Numeracy');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Year 4');
  await page.keyboard.press(`${MOD}+Enter`);
  await page.keyboard.type('assessment');
  await page.keyboard.press('NumpadEnter');
  await page.keyboard.type('Training');
  await page.keyboard.press('Escape');

  await expect(selected(page)).toHaveText('Training');
  await expect(page.locator('.node.is-editing')).toHaveCount(0);
  expect(await outline(page)).toBe(
    '# Education plan\n\n- Literacy\n- Numeracy\n  - Year 4\n    assessment\n  - Training\n',
  );

  // A second Escape clears the selection.
  await page.keyboard.press('Escape');
  await expect(selected(page)).toHaveCount(0);
});

test('Tab on the root alternates sides to keep the map balanced', async ({ page, openMap }) => {
  await openMap('Root');
  for (const text of ['R1', 'L1', 'R2']) {
    await node(page, 'Root').click();
    await page.keyboard.press('Tab');
    await page.keyboard.type(text);
    await page.keyboard.press('Escape');
  }
  const rootBox = (await node(page, 'Root').boundingBox())!;
  expect((await node(page, 'R1').boundingBox())!.x).toBeGreaterThan(rootBox.x + rootBox.width);
  expect((await node(page, 'R2').boundingBox())!.x).toBeGreaterThan(rootBox.x + rootBox.width);
  expect((await node(page, 'L1').boundingBox())!.x).toBeLessThan(rootBox.x);
});

test('arrow keys move to children, parents and siblings on both sides', async ({
  page,
  openMap,
}) => {
  await openMap('Root', { A: { A1: {}, A2: {} }, B: { B1: {} } });
  await node(page, 'Root').click();
  const path: [string, string][] = [
    ['ArrowRight', 'A'],
    ['ArrowRight', 'A1'],
    ['ArrowDown', 'A2'],
    ['ArrowUp', 'A1'],
    ['ArrowLeft', 'A'],
    ['ArrowLeft', 'Root'],
    ['ArrowLeft', 'B'],
    ['ArrowLeft', 'B1'],
    ['ArrowRight', 'B'],
  ];
  for (const [key, expected] of path) {
    await page.keyboard.press(key);
    await expect(selected(page), `${key} → ${expected}`).toHaveText(expected);
  }
});

test('Delete removes a branch; undo and redo restore it with its selection', async ({
  page,
  openMap,
}) => {
  await openMap('Root', { A: { A1: {} }, B: {}, C: {} });
  await node(page, 'C').click();
  await page.keyboard.press('Delete');
  await node(page, 'A').click();
  await page.keyboard.press('Backspace');
  await expect(node(page, 'A1')).toHaveCount(0);
  await expect(selected(page)).toHaveText('Root');
  expect(await outline(page)).toBe('# Root\n\n- B\n');

  await page.keyboard.press(`${MOD}+z`);
  await expect(node(page, 'A1')).toBeVisible();
  await expect(selected(page)).toHaveText('A');
  await page.keyboard.press(`${MOD}+Shift+z`);
  await expect(node(page, 'A')).toHaveCount(0);
  await page.keyboard.press(`${MOD}+z`);
  await page.keyboard.press(`${MOD}+z`);
  expect(await outline(page)).toBe('# Root\n\n- A\n  - A1\n- C\n- B\n');
});

test('collapse hides a branch, shows a count, and arrows expand it', async ({ page, openMap }) => {
  await openMap('Root', { A: { A1: { 'A1.a': {} }, A2: {} } });
  await node(page, 'A').click();
  await page.keyboard.press(`${MOD}+.`);
  await expect(node(page, 'A1')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Expand branch' })).toHaveText('3');
  await expect(node(page, 'A')).toHaveAttribute('aria-expanded', 'false');

  await page.keyboard.press('ArrowRight');
  await expect(selected(page)).toHaveText('A1');
  await expect(node(page, 'A2')).toBeVisible();

  await page.getByRole('button', { name: 'Collapse branch' }).first().click();
  await expect(node(page, 'A1.a')).toHaveCount(0);
});

test('typing replaces a node, F2 and double-click edit it in place', async ({ page, openMap }) => {
  await openMap('Root', { Old: {} });
  await node(page, 'Old').click();
  await page.keyboard.type('New');
  await page.keyboard.press('Escape');
  await page.keyboard.press('F2');
  await page.keyboard.type(' text');
  await page.keyboard.press('Escape');
  await expect(selected(page)).toHaveText('New text');

  await node(page, 'New text').dblclick();
  await page.keyboard.press('End');
  await page.keyboard.type('!');
  await page.keyboard.press('Escape');
  await expect(selected(page)).toHaveText('New text!');
});

test('the + buttons add children and siblings', async ({ page, openMap }) => {
  await openMap('Root', { A: {} });
  await node(page, 'A').click();
  await page.getByRole('button', { name: 'Add child (Tab)' }).click();
  await page.keyboard.type('Child');
  await page.keyboard.press('Escape');
  await node(page, 'A').click();
  await page.getByRole('button', { name: 'Add sibling (Enter)' }).click();
  await page.keyboard.type('Sibling');
  await page.keyboard.press('Escape');
  await node(page, 'Root').click();
  await page.getByRole('button', { name: 'Add branch on the left' }).click();
  await page.keyboard.type('Left');
  await page.keyboard.press('Escape');
  expect(await outline(page)).toBe('# Root\n\n- A\n  - Child\n- Sibling\n- Left\n');
});

test('dragging a node onto another moves the whole branch', async ({ page, openMap }) => {
  await openMap('Root', { A: {}, B: { B1: {} } });
  const from = (await node(page, 'B').boundingBox())!;
  const to = (await node(page, 'A').boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
  await expect(page.locator('.placeholder')).toBeVisible();
  await page.mouse.up();
  expect(await outline(page)).toBe('# Root\n\n- A\n  - B\n    - B1\n');

  await page.keyboard.press(`${MOD}+z`);
  expect(await outline(page)).toBe('# Root\n\n- A\n- B\n  - B1\n');
});

test('edits are saved and survive a reload', async ({ page, openMap }) => {
  await openMap('Persist', { A: {} });
  await node(page, 'A').click();
  await page.keyboard.press('Tab');
  await page.keyboard.type('Saved child');
  await page.keyboard.press('Escape');
  await waitSaved(page);
  await page.reload();
  await expect(node(page, 'Saved child')).toBeVisible();
  expect(await outline(page)).toBe('# Persist\n\n- A\n  - Saved child\n');
});

test('style changes apply to the selected node', async ({ page, openMap }) => {
  await openMap('Root', { A: {} });
  await node(page, 'A').click();
  await page.getByRole('radio', { name: 'Pill shape' }).click();
  await page.getByRole('radio', { name: 'Colour #d0ebff' }).click();
  await expect(node(page, 'A')).toHaveClass(/node--pill/);
  await expect(node(page, 'A')).toHaveCSS('background-color', 'rgb(208, 235, 255)');
});

test('imports a Markdown outline and exports PNG and SVG', async ({ page, track }) => {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles({
    name: 'plan.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('# Imported\n\n- One\n  - One.a\n- Two\n'),
  });
  await expect(node(page, 'Imported')).toBeVisible();
  track(page);
  await expect(node(page, 'One.a')).toBeVisible();

  for (const [label, extension] of [
    ['SVG image', '.svg'],
    ['PNG image', '.png'],
  ] as const) {
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('menuitem', { name: label }).click(),
    ]);
    expect(download.suggestedFilename()).toBe(`Imported${extension}`);
    const path = await download.path();
    const { size } = await import('node:fs/promises').then((fs) => fs.stat(path));
    expect(size).toBeGreaterThan(500);
  }
});

test('a 500-node map responds to Tab within one frame', async ({ page, openMap }) => {
  const tree: Tree = {};
  for (let i = 0; i < 25; i++) {
    tree[`Branch ${i}`] = Object.fromEntries(
      Array.from({ length: 19 }, (_, j): [string, Tree] => [`Leaf ${i}.${j}`, {}]),
    );
  }
  await openMap('Big map', tree);
  await expect(page.getByRole('treeitem')).toHaveCount(501);
  // The map is taller than the screen even at minimum zoom; arrow keys pan to the selection.
  await node(page, 'Big map').click();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(selected(page)).toHaveText('Leaf 0.0');

  // Time from the key event to the next animation frame, by which point React has committed.
  await page.evaluate(() => {
    const w = window as unknown as { __tabTimings: number[] };
    w.__tabTimings = [];
    window.addEventListener(
      'keydown',
      (event) => {
        if (event.key !== 'Tab') return;
        const start = event.timeStamp;
        requestAnimationFrame(() => w.__tabTimings.push(performance.now() - start));
      },
      true,
    );
  });
  for (let run = 0; run < 5; run++) {
    await page.keyboard.press('Tab');
    await expect(page.locator('.node.is-editing')).toHaveCount(1);
    await page.keyboard.press('Escape');
  }
  await expect(page.getByRole('treeitem')).toHaveCount(506);
  const timings = await page.evaluate(
    () => (window as unknown as { __tabTimings: number[] }).__tabTimings,
  );
  expect(timings).toHaveLength(5);
  const median = [...timings].sort((a, b) => a - b)[2]!;
  console.log(
    `Tab → next frame on 500 nodes: median ${median.toFixed(1)} ms (${timings.map((t) => t.toFixed(1)).join(', ')})`,
  );
  expect(median).toBeLessThan(16);
});
