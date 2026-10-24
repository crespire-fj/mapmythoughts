import { readFile } from 'node:fs/promises';
import { expect, node, outline, selected, test, waitSaved } from './fixtures';

test('cross-links: draw one, label it, delete it and undo', async ({ page, openMap }) => {
  await openMap('Root', { Risk: {}, Budget: {} });
  await node(page, 'Risk').click();
  await page.keyboard.press('Alt+KeyL');
  await node(page, 'Budget').click();
  await expect(page.locator('.xlink')).toHaveCount(1);
  await expect(page.locator('.xlink.is-selected')).toHaveCount(1);

  await page.keyboard.press('Enter');
  await page.getByLabel('Link label').fill('affects');
  await page.getByLabel('Link label').press('Enter');
  await expect(page.locator('.xlink-label')).toHaveText('affects');

  await page.getByRole('button', { name: 'Link from Risk to Budget' }).click({ force: true });
  await page.keyboard.press('Delete');
  await expect(page.locator('.xlink')).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('.xlink')).toHaveCount(1);
  await expect(page.locator('.xlink-label')).toHaveText('affects');
});

test('cross-links: link two selected nodes, refuse duplicates, follow node deletion', async ({
  page,
  openMap,
}) => {
  await openMap('Root', { A: { A1: {} }, B: {} });
  await node(page, 'A1').click();
  await node(page, 'B').click({ modifiers: ['Shift'] });
  await page.getByRole('button', { name: 'Link these two nodes' }).click();
  await expect(page.locator('.xlink')).toHaveCount(1);
  await node(page, 'B').click();
  await node(page, 'A1').click({ modifiers: ['Shift'] });
  await page.getByRole('button', { name: 'Link these two nodes' }).click();
  await expect(page.getByText('Those two nodes are already linked.')).toBeVisible();

  await node(page, 'A').click();
  await page.keyboard.press('ControlOrMeta+.'); // collapse A: the link's end is hidden
  await expect(page.locator('.xlink')).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+.');
  await expect(page.locator('.xlink')).toHaveCount(1);
  await node(page, 'A').click();
  await page.keyboard.press('Delete'); // deleting A deletes A1 and its link
  await expect(page.locator('.xlink')).toHaveCount(0);
});

test('focus mode shows one branch as the whole map and edits the real map', async ({
  page,
  openMap,
}) => {
  await openMap('Plan', { Goals: { Literacy: { Reading: {} }, Numeracy: {} }, Risks: {} });
  await node(page, 'Goals').click();
  await page.keyboard.press('Alt+KeyF');
  await expect(page.locator('[data-node-id=root]')).toHaveText('Goals');
  await expect(node(page, 'Risks')).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Focus' })).toContainText('Plan');

  await page.keyboard.press('Tab'); // the root here is Goals, so this adds a child of Goals
  await page.keyboard.type('Science');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape'); // clear the selection
  await page.keyboard.press('Escape'); // leave focus mode
  await expect(node(page, 'Risks')).toBeVisible();
  await expect(selected(page)).toHaveText('Goals');
  expect(await outline(page)).toBe(
    '# Plan\n\n- Goals\n  - Literacy\n    - Reading\n  - Numeracy\n  - Science\n- Risks\n',
  );
});

test('presentation steps through the main branches and dims the rest', async ({
  page,
  openMap,
}) => {
  await openMap('Talk', { Why: { Evidence: {} }, How: {}, Next: {} });
  await page.getByRole('button', { name: 'Present' }).click();
  const presenter = page.getByRole('toolbar', { name: 'Presentation' });
  await expect(presenter).toContainText('1 / 4');
  await expect(page.locator('.toolbar')).toBeHidden();
  await page.keyboard.press('ArrowRight');
  await expect(presenter).toContainText('2 / 4');
  await expect(presenter).toContainText('Why');
  await expect(node(page, 'How')).toHaveClass(/is-dimmed/);
  await expect(node(page, 'Evidence')).not.toHaveClass(/is-dimmed/);
  await page.keyboard.press('End');
  await expect(presenter).toContainText('4 / 4');
  await page.keyboard.press('a'); // typing does nothing while presenting
  await expect(page.locator('.node.is-editing')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(presenter).toHaveCount(0);
  await expect(page.locator('.toolbar')).toBeVisible();
});

test('map cards show a real thumbnail, served safely', async ({ page, openMap, request }) => {
  const id = await openMap('Thumb', { A: { A1: {} }, B: {} });
  await expect
    .poll(async () => (await (await request.get(`/api/maps/${id}`)).json()).thumbnailAt, {
      timeout: 10_000,
    })
    .not.toBeNull();
  await page.getByRole('button', { name: 'Maps' }).click();
  const img = page
    .locator('.card', { has: page.getByRole('button', { name: 'Open Thumb' }) })
    .locator('img');
  await expect(img).toHaveAttribute('src', new RegExp(`/api/maps/${id}/thumbnail.svg`));
  await expect
    .poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth))
    .toBeGreaterThan(0);

  const response = await request.get(`/api/maps/${id}/thumbnail.svg`);
  expect(response.headers()['content-type']).toContain('image/svg+xml');
  expect(response.headers()['content-security-policy']).toContain("default-src 'none'");
  const bad = await request.put(`/api/maps/${id}/thumbnail`, {
    data: { svg: '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>' },
  });
  expect(bad.status()).toBe(400);
});

test('share a collection by .mmt file: export, then import it back intact', async ({
  page,
  request,
}) => {
  const tag = `Share ${Date.now().toString(36)}`;
  const collection = await (
    await request.post('/api/collections', { data: { name: tag, color: '#e05297' } })
  ).json();
  await page.goto(`/#/collection/${collection.id}`);
  await page.getByRole('button', { name: 'New Brainstorm' }).click();
  await expect(node(page, 'Ideas')).toBeVisible();
  await node(page, 'Ideas').click();
  await page.keyboard.press('ControlOrMeta+i');
  await page
    .getByPlaceholder('Background, evidence, decisions, next steps…')
    .fill('From the workshop');
  await node(page, 'Risks').click();
  await page.keyboard.press('Alt+KeyL');
  await node(page, 'Next steps').click();
  await waitSaved(page);
  await page.getByRole('button', { name: `Back to ${tag}` }).click();

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export collection to share' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe(`${tag.replace(/\s+/g, '-')}.mmt`);
  const file = await readFile(await download.path());

  // Simulate a colleague's Mac: the collection and its map don't exist yet.
  await page.getByRole('button', { name: 'Delete collection' }).click();
  await page.getByRole('button', { name: /Delete it and its 1 map/ }).click();
  await expect(
    page
      .getByRole('navigation', { name: 'Collections' })
      .getByRole('button', { name: new RegExp(tag) }),
  ).toHaveCount(0);

  await page
    .locator('input[type=file]')
    .setInputFiles({ name: 'shared.mmt', mimeType: 'application/json', buffer: file });
  await expect(node(page, 'Ideas')).toBeVisible(); // a single map opens straight away
  await expect(page.getByRole('button', { name: `Back to ${tag}` })).toBeVisible(); // back in its collection
  await expect(page.locator('.xlink')).toHaveCount(1);
  await expect(node(page, 'Ideas').getByRole('button', { name: 'Show note' })).toBeVisible();

  const collections = (await (await request.get('/api/collections')).json()) as {
    id: string;
    name: string;
  }[];
  const recreated = collections.find((c) => c.name === tag)!;
  await request.delete(`/api/collections/${recreated.id}?deleteMaps=true`);
});

test('importing something that is not a Map My Thoughts file explains why', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type=file]').setInputFiles({
    name: 'other.mmt',
    mimeType: 'application/json',
    buffer: Buffer.from('{"hello": "world"}'),
  });
  await expect(page.getByRole('alert')).toContainText('This file is not a Map My Thoughts file.');
});

test('the SPC brand theme uses SPC Blue and Cyan', async ({ page, openMap }) => {
  await openMap('Brand', { First: {}, Second: {} });
  await page.getByRole('button', { name: 'Theme' }).click();
  await page.getByRole('menuitemradio', { name: /SPC/ }).click();
  await expect(page.locator('[data-node-id=root]')).toHaveAttribute('style', /#0046AD.*#00B0CA/i);
  await expect(node(page, 'First')).toHaveCSS('background-color', 'rgb(0, 176, 202)');
  await expect(node(page, 'Second')).toHaveCSS('background-color', 'rgb(0, 70, 173)');
});
