import { expect, node, outline, pasteText, selected, test, waitSaved } from './fixtures';

const MOD = 'ControlOrMeta';

test('copy and paste a branch, and paste text from other apps as branches', async ({
  page,
  openMap,
}) => {
  await openMap('Root', { A: { A1: {} }, B: {} });
  await node(page, 'A').click();
  await page.keyboard.press(`${MOD}+c`);
  await node(page, 'B').click();
  await page.keyboard.press(`${MOD}+v`);
  await expect(selected(page)).toHaveText('A');
  expect(await outline(page)).toBe('# Root\n\n- A\n  - A1\n- B\n  - A\n    - A1\n');

  await node(page, 'Root').click();
  await pasteText(page, '- Pasted\n  - child\n- Second');
  // pasted branches balance across the sides: right gets one, left the other
  expect(await outline(page)).toBe(
    '# Root\n\n- A\n  - A1\n- Pasted\n  - child\n- B\n  - A\n    - A1\n- Second\n',
  );

  await node(page, 'Second').click();
  await page.keyboard.press(`${MOD}+x`);
  await expect(node(page, 'Second')).toHaveCount(0);
});

test('⌥ arrows reorder, indent and outdent; ⌘D duplicates', async ({ page, openMap }) => {
  await openMap('Root', { A: { A1: {}, A2: {}, A3: {} } });
  await node(page, 'A3').click();
  await page.keyboard.press('Alt+ArrowUp');
  expect(await outline(page)).toBe('# Root\n\n- A\n  - A1\n  - A3\n  - A2\n');
  await page.keyboard.press('Alt+ArrowRight'); // indent under A1
  expect(await outline(page)).toBe('# Root\n\n- A\n  - A1\n    - A3\n  - A2\n');
  await page.keyboard.press('Alt+ArrowLeft'); // back out
  await page.keyboard.press('Alt+ArrowLeft'); // to first level
  expect(await outline(page)).toBe('# Root\n\n- A\n  - A1\n  - A2\n- A3\n');
  await page.keyboard.press(`${MOD}+d`);
  expect(await outline(page)).toBe('# Root\n\n- A\n  - A1\n  - A2\n- A3\n- A3\n');
  await page.keyboard.press(`${MOD}+z`); // undo duplicate
  await page.keyboard.press(`${MOD}+z`); // undo the second outdent
  expect(await outline(page)).toBe('# Root\n\n- A\n  - A1\n  - A3\n  - A2\n');
});

test('shift-click selects several nodes to style or delete together', async ({ page, openMap }) => {
  await openMap('Root', { A: {}, B: {}, C: {} });
  await node(page, 'A').click();
  await node(page, 'C').click({ modifiers: ['Shift'] });
  await expect(page.locator('.node.is-selected')).toHaveCount(2);
  await page.getByRole('radio', { name: 'Star marker' }).click();
  await expect(node(page, 'A').getByRole('img', { name: 'Star' })).toBeVisible();
  await expect(node(page, 'C').getByRole('img', { name: 'Star' })).toBeVisible();
  await page.keyboard.press('Delete');
  expect(await outline(page)).toBe('# Root\n\n- B\n');
});

test('⌘A selects everything and a Shift-drag selects a region', async ({ page, openMap }) => {
  await openMap('Root', { A: {}, B: {}, C: {}, D: {} });
  await node(page, 'Root').click();
  await page.keyboard.press(`${MOD}+a`);
  await expect(page.locator('.node.is-selected')).toHaveCount(5);
  await page.keyboard.press('Escape');

  const a = (await node(page, 'A').boundingBox())!;
  const c = (await node(page, 'C').boundingBox())!;
  const left = Math.min(a.x, c.x) - 10;
  const top = Math.min(a.y, c.y) - 10;
  const right = Math.max(a.x + a.width, c.x + c.width) + 10;
  const bottom = Math.max(a.y + a.height, c.y + c.height) + 10;
  await page.keyboard.down('Shift');
  await page.mouse.move(left, top);
  await page.mouse.down();
  await page.mouse.move(right, bottom, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await expect(page.locator('.node.is-selected')).toHaveCount(2);
});

test('⌘F finds nodes, opens collapsed branches and selects the match', async ({
  page,
  openMap,
}) => {
  await openMap('Root', { Goals: { Literacy: { 'Reading fluency': {} } }, Risks: {} });
  await node(page, 'Goals').click();
  await page.keyboard.press(`${MOD}+.`);
  await expect(node(page, 'Reading fluency')).toHaveCount(0);
  await page.keyboard.press(`${MOD}+f`);
  await page.keyboard.type('fluency');
  await expect(page.getByText('1 of 1')).toBeVisible();
  await expect(node(page, 'Reading fluency')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(selected(page)).toHaveText('Reading fluency');
  await page.keyboard.press('Tab'); // shortcuts work again straight away
  await expect(page.locator('.node.is-editing')).toHaveCount(1);
});

test('⌥1 / ⌥0 show levels', async ({ page, openMap }) => {
  await openMap('Root', { A: { A1: { A1a: {} } }, B: { B1: {} } });
  await node(page, 'Root').click();
  await page.keyboard.press('Alt+Digit1');
  await expect(node(page, 'A1')).toHaveCount(0);
  await expect(node(page, 'B1')).toHaveCount(0);
  await page.keyboard.press('Alt+Digit0');
  await expect(node(page, 'A1a')).toBeVisible();
});

test('notes, links and markers in the details panel, exported to Markdown', async ({
  page,
  openMap,
}) => {
  await openMap('Plan', { Goal: {} });
  await node(page, 'Goal').click();
  await page.keyboard.press(`${MOD}+i`);
  await page
    .getByPlaceholder('Background, evidence, decisions, next steps…')
    .fill('Agreed in October');
  const link = page.getByPlaceholder('https://…');
  await link.fill('javascript:alert(1)');
  await link.press('Enter');
  await expect(page.getByText(/Enter a web or email address/)).toBeVisible();
  await link.fill('spc.int');
  await link.press('Enter');
  await page.getByRole('radio', { name: 'Important', exact: true }).click();
  await expect(node(page, 'Goal').getByRole('link', { name: /Open link/ })).toHaveAttribute(
    'href',
    'https://spc.int/',
  );
  await expect(node(page, 'Goal').getByRole('button', { name: 'Show note' })).toBeVisible();
  expect(await outline(page)).toBe('# Plan\n\n- [Goal](https://spc.int/)\n  > Agreed in October\n');
});

test('outline panel selects and renames nodes', async ({ page, openMap }) => {
  await openMap('Root', { A: { A1: {} } });
  await page.getByRole('button', { name: 'Outline', exact: true }).click();
  const panel = page.getByRole('complementary', { name: 'Outline' });
  await panel.getByRole('treeitem', { name: /A1/ }).click();
  await expect(selected(page)).toHaveText('A1');
  await panel.getByRole('treeitem', { name: /A1/ }).dblclick();
  await panel.locator('input').fill('Renamed');
  await panel.locator('input').press('Enter');
  await expect(node(page, 'Renamed')).toBeVisible();
});

test('layout, connector and theme settings apply and can be undone', async ({ page, openMap }) => {
  await openMap('Root', { Down: {} });
  const root = node(page, 'Root');
  await page.getByRole('button', { name: 'Layout and levels' }).click();
  await page.getByRole('menuitemradio', { name: 'Top and bottom' }).click();
  await expect
    .poll(async () => (await node(page, 'Down').boundingBox())!.y)
    .toBeGreaterThan((await root.boundingBox())!.y + 30);
  await page.getByRole('button', { name: 'Theme' }).click();
  await page.getByRole('menuitemradio', { name: /Sunset/ }).click();
  await expect(root).toHaveAttribute('style', /#7c2d12/);
  await page.keyboard.press(`${MOD}+z`);
  await expect(root).not.toHaveAttribute('style', /#7c2d12/);
});

test('history saves versions and restores them (undoably)', async ({ page, openMap }) => {
  await openMap('Versions', { Keep: {} });
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await page.getByLabel('Version name').fill('Baseline');
  await page.getByRole('button', { name: 'Save version', exact: true }).click();
  await expect(page.getByText('Baseline')).toBeVisible();

  await node(page, 'Keep').click();
  await page.keyboard.press('Delete');
  await expect(node(page, 'Keep')).toHaveCount(0);
  await page.getByRole('button', { name: /Restore Baseline/ }).click();
  await expect(node(page, 'Keep')).toBeVisible();
  await expect(page.getByText(/Before restoring “Baseline”/)).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).last().click();
  await expect(node(page, 'Keep')).toHaveCount(0);
});

test('the view is remembered per map', async ({ page, openMap }) => {
  await openMap('Zoom', { A: {} });
  const label = page.locator('.zoombar__value');
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect(label).toHaveText('144%');
  await page.waitForTimeout(600);
  await page.reload();
  await expect(label).toHaveText('144%');
});

test('exports a Word document', async ({ page, openMap }) => {
  await openMap('Report', { Findings: { 'Literacy improved': {} } });
  await waitSaved(page);
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: 'Word document' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('Report.docx');
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const file = Buffer.concat(chunks);
  expect(file.subarray(0, 2).toString()).toBe('PK'); // a zip container, as .docx files are
  expect(file.length).toBeGreaterThan(5000);
});

test('templates, duplicate and colour mode on the start page', async ({ page, request }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New SWOT analysis' }).click();
  await expect(node(page, 'Strengths')).toBeVisible();
  const id = /#\/map\/([\w-]+)/.exec(page.url())![1]!;
  await waitSaved(page);
  await page.getByRole('button', { name: 'Maps' }).click();
  await page.getByRole('button', { name: 'Actions for SWOT analysis', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Duplicate' }).click();
  await expect(page.getByRole('button', { name: 'Open SWOT analysis (copy)' })).toBeVisible();
  const maps = (await (await request.get('/api/maps')).json()) as { id: string; title: string }[];
  const copy = maps.find((m) => m.title === 'SWOT analysis (copy)')!;
  await request.delete(`/api/maps/${copy.id}`);
  await request.delete(`/api/maps/${id}`);
  expect(copy.id).not.toBe(id);

  const html = page.locator('html');
  const before = await html.getAttribute('data-theme');
  await page.getByRole('button', { name: /Colour mode/ }).click();
  await page.getByRole('button', { name: /Colour mode/ }).click();
  expect(await html.getAttribute('data-theme')).not.toBe(before);
});

test('PDF export prints the map followed by the outline with notes', async ({ page, openMap }) => {
  await openMap('Print me', { Findings: { 'Literacy improved': {} } });
  await node(page, 'Findings').click();
  await page.keyboard.press(`${MOD}+i`);
  await page
    .getByPlaceholder('Background, evidence, decisions, next steps…')
    .fill('Source: 2026 survey');
  await page.evaluate(() => {
    // Stand-in for the print dialog: record what would be printed.
    window.print = () => {
      const root = document.getElementById('print-root');
      (window as unknown as { printed: string }).printed = root
        ? `${root.querySelectorAll('svg').length}|${root.innerText}`
        : '';
      window.dispatchEvent(new Event('afterprint'));
    };
  });
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  await page.getByRole('menuitem', { name: 'PDF (print)' }).click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { printed?: string }).printed ?? ''))
    .toMatch(
      /^1\|[\s\S]*Print me[\s\S]*Findings[\s\S]*Source: 2026 survey[\s\S]*Literacy improved/,
    );
  await expect(page.locator('#print-root')).toHaveCount(0);
});
