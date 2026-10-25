import * as Y from 'yjs';
import { buildMapDoc, type OutlineNode } from '../src/commands/commands';
import { expect, node, selected, test, waitSaved } from './fixtures';

const MOD = 'ControlOrMeta';

const box = async (page: import('@playwright/test').Page, text: string) =>
  (await node(page, text).boundingBox())!;

test('steps layout stacks a process downward; arrows follow it; ⌥S turns it off', async ({
  page,
  openMap,
}) => {
  await openMap('Process', { Apply: { Submit: { Review: { Decide: {} } } }, Other: {} });
  await node(page, 'Apply').click();
  await page.getByRole('button', { name: 'Lay out as steps' }).click();
  await expect(page.getByRole('button', { name: 'Lay out as steps' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect
    .poll(async () => (await box(page, 'Submit')).y)
    .toBeGreaterThan((await box(page, 'Apply')).y + 20);
  const [submit, review] = [await box(page, 'Submit'), await box(page, 'Review')];
  expect(Math.abs(submit.x + submit.width / 2 - (review.x + review.width / 2))).toBeLessThan(2);
  expect(review.y).toBeGreaterThan(submit.y + submit.height);

  await node(page, 'Submit').click();
  await page.keyboard.press('ArrowDown');
  await expect(selected(page)).toHaveText('Review');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await expect(selected(page)).toHaveText('Apply');

  await page.keyboard.press('Alt+KeyS');
  await expect
    .poll(async () => (await box(page, 'Submit')).x)
    .toBeGreaterThan((await box(page, 'Apply')).x + (await box(page, 'Apply')).width);
});

test('zooms out to 5% to see a whole long map', async ({ page, openMap }) => {
  await openMap('Wide', { A: {} });
  const zoomOut = page.getByRole('button', { name: 'Zoom out' });
  for (let i = 0; i < 20; i++) await zoomOut.click();
  await expect(page.locator('.zoombar')).toContainText('5%');
});

test('links to a node and to a map, followed in the same tab', async ({
  page,
  context,
  openMap,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const other = await openMap('Appeals process', { 'Fill form': {} });
  const mapId = await openMap('Course flow', { Rejected: {}, Approved: {}, Appeal: {} });

  // copy a link to "Approved" and paste it into "Rejected"
  await node(page, 'Approved').click();
  await page.keyboard.press(`${MOD}+i`);
  await page.getByRole('button', { name: 'Copy link to this node' }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  const approvedId = await node(page, 'Approved').getAttribute('data-node-id');
  expect(copied).toMatch(new RegExp(`/#/map/${mapId}/node/${approvedId}$`));
  await node(page, 'Rejected').click();
  const linkField = page.getByLabel('Link', { exact: true });
  await linkField.fill(copied);
  await linkField.press('Enter');
  await expect(page.getByText('Goes to a node in this map')).toBeVisible();
  await expect(
    node(page, 'Rejected').getByRole('link', { name: 'Go to linked node' }),
  ).toBeVisible();
  await page
    .getByRole('complementary', { name: 'Node details' })
    .getByRole('link', { name: 'Go' })
    .click();
  await expect(selected(page)).toHaveText('Approved');
  await expect(page).toHaveURL(new RegExp(`#/map/${mapId}$`)); // ready to follow again

  // link "Appeal" to the other map with the picker, then follow it
  await node(page, 'Appeal').click();
  await page.getByLabel('Link to another map').selectOption({ label: 'Appeals process' });
  await expect(page.getByText('Goes to “Appeals process”')).toBeVisible();
  await page.getByRole('button', { name: 'Close details' }).click();
  await node(page, 'Appeal').getByRole('link', { name: 'Go to linked map' }).click();
  await expect(page).toHaveURL(new RegExp(`#/map/${other}$`));
  await expect(node(page, 'Fill form')).toBeVisible();

  // a node link opened directly selects that node
  await page.goto(`/#/map/${mapId}/node/${approvedId}`);
  await expect(selected(page)).toHaveText('Approved');
});

test('moves a branch to a new map in the same collection, and undo brings it back', async ({
  page,
  request,
}) => {
  const tag = `Move ${Date.now().toString(36)}`;
  const collection = (await (
    await request.post('/api/collections', { data: { name: tag, color: '#6246ea' } })
  ).json()) as { id: string };
  const doc = buildMapDoc('Plan', [
    {
      text: 'Appeals',
      children: [{ text: 'Fill form', children: [{ text: 'Committee', children: [] }] }],
    },
    { text: 'Budget', children: [] },
  ] as OutlineNode[]);
  const state = Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64');
  const { id } = (await (
    await request.post('/api/maps', { data: { state, collectionId: collection.id } })
  ).json()) as { id: string };
  await page.goto(`/#/map/${id}`);

  await node(page, 'Appeals').click();
  await page.getByRole('button', { name: 'Move branch to a new map' }).click();
  await expect(page.getByText('Moved to the new map “Appeals”')).toBeVisible();
  await expect(node(page, 'Fill form')).toHaveCount(0);
  await expect(node(page, 'Appeals').getByRole('link', { name: 'Go to linked map' })).toBeVisible();
  await waitSaved(page);

  const maps = (await (await request.get('/api/maps')).json()) as {
    id: string;
    title: string;
    collectionId: string | null;
    nodeCount: number;
  }[];
  const created = maps.find((m) => m.title === 'Appeals' && m.collectionId === collection.id)!;
  expect(created.nodeCount).toBe(2);

  await page.keyboard.press(`${MOD}+z`);
  await expect(node(page, 'Committee')).toBeVisible();
  await node(page, 'Appeals')
    .getByRole('link', { name: 'Go to linked map' })
    .waitFor({ state: 'detached' });

  await page.goto(`/#/map/${created.id}`);
  await expect(node(page, 'Committee')).toBeVisible();
  await request.delete(`/api/collections/${collection.id}?deleteMaps=true`);
});

test('find and replace: one at a time or all, and undo', async ({ page, openMap }) => {
  await openMap('Appvoved flow', { Appvoved: { 'Not appvoved': {} }, Rejected: {} });
  await page.keyboard.press(`Alt+${MOD}+KeyF`);
  await page.getByRole('textbox', { name: 'Find in map' }).fill('appvoved');
  await page.getByLabel('Replace with').fill('Approved');
  await expect(page.locator('.searchbar')).toContainText('3 to replace');
  await page.getByRole('button', { name: 'Replace', exact: true }).click();
  await expect(node(page, 'Approved')).toBeVisible();
  await page.getByRole('button', { name: 'Replace all' }).click();
  await expect(node(page, 'Not Approved')).toBeVisible();
  await expect(page.locator('[data-node-id=root]')).toHaveText('Approved flow');
  await expect(page.getByText('Replaced 2 times. Undo puts them back.')).toBeVisible();
  await page.getByRole('textbox', { name: 'Find in map' }).press('Escape');
  await page.keyboard.press(`${MOD}+z`);
  await expect(node(page, 'Not appvoved')).toBeVisible();
});

test('open items list questions and to-dos, here and across the collection', async ({
  page,
  request,
}) => {
  const tag = `Open ${Date.now().toString(36)}`;
  const collection = (await (
    await request.post('/api/collections', { data: { name: tag, color: '#6246ea' } })
  ).json()) as { id: string };
  const make = async (title: string, outline: OutlineNode[]) => {
    const state = Buffer.from(Y.encodeStateAsUpdate(buildMapDoc(title, outline))).toString(
      'base64',
    );
    return (
      (await (
        await request.post('/api/maps', { data: { state, collectionId: collection.id } })
      ).json()) as { id: string }
    ).id;
  };
  const leaf = (text: string, extra: Partial<OutlineNode> = {}): OutlineNode => ({
    text,
    children: [],
    ...extra,
  });
  await make('Second map', [leaf('Confirm the fee', { marker: 'question' })]);
  const id = await make('First map', [
    {
      text: 'Review',
      children: [leaf('How does review work?', { marker: 'question', note: 'Ask Gibson' })],
    },
    leaf('Write the report', { marker: 'todo' }),
    leaf('Finished', { marker: 'done' }),
  ]);
  await page.goto(`/#/map/${id}`);

  const toolbarButton = page.getByRole('button', { name: 'Open items (2)' });
  await toolbarButton.click();
  const panel = page.getByRole('complementary', { name: 'Open items' });
  await expect(panel.getByRole('heading', { name: /Question/ })).toBeVisible();
  await expect(panel).toContainText('How does review work?');
  await expect(panel).toContainText('Ask Gibson');
  await expect(panel).not.toContainText('Finished');
  await panel.getByRole('button', { name: /Write the report/ }).click();
  await expect(selected(page)).toHaveText('Write the report');

  await panel.getByRole('radio', { name: `All of ${tag}` }).click();
  await panel.getByRole('button', { name: /Confirm the fee/ }).click();
  await expect(selected(page)).toHaveText('Confirm the fee');
  await request.delete(`/api/collections/${collection.id}?deleteMaps=true`);
});

test('notes preview on hover, and can be shown on the map', async ({ page, openMap }) => {
  await openMap('Notes', { Goal: {} });
  await node(page, 'Goal').click();
  await page.keyboard.press(`${MOD}+i`);
  await page
    .getByPlaceholder('Background, evidence, decisions, next steps…')
    .fill('Agreed at the October workshop');
  await page.getByRole('button', { name: 'Close details' }).click();

  await node(page, 'Goal').getByRole('button', { name: 'Show note' }).hover();
  await expect(page.getByRole('tooltip')).toHaveText('Agreed at the October workshop');
  await page.mouse.move(5, 500);
  await expect(page.getByRole('tooltip')).toHaveCount(0);

  const before = (await box(page, 'Goal')).height;
  await page.getByRole('button', { name: 'Layout and levels' }).click();
  await page.getByRole('menuitemradio', { name: 'Show notes on the map' }).click();
  await expect(node(page, 'Goal').locator('.node__note')).toHaveText(
    'Agreed at the October workshop',
  );
  expect((await box(page, 'Goal')).height).toBeGreaterThan(before + 15);
  // it is a per-Mac view preference: turn it off again for other tests
  await page.getByRole('button', { name: 'Layout and levels' }).click();
  await page.getByRole('menuitemradio', { name: 'Show notes on the map' }).click();
  await expect(node(page, 'Goal').locator('.node__note')).toHaveCount(0);
});
