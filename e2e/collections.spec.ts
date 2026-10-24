import { test as base, expect, type APIRequestContext, type Page } from '@playwright/test';

/** Each test gets unique collection names and cleans up every collection and map it made. */
const test = base.extend<{ unique: (name: string) => string }>({
  unique: async ({ request }, use) => {
    const tag = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    await use((name) => `${name} ${tag}`);
    await cleanUp(request, tag);
  },
});

async function cleanUp(request: APIRequestContext, tag: string) {
  const collections = (await (await request.get('/api/collections')).json()) as {
    id: string;
    name: string;
  }[];
  const mine = collections.filter((c) => c.name.endsWith(tag));
  const maps = (await (await request.get('/api/maps')).json()) as {
    id: string;
    title: string;
    collectionId: string | null;
  }[];
  for (const map of maps) {
    if (mine.some((c) => c.id === map.collectionId) || map.title.endsWith(tag)) {
      await request.delete(`/api/maps/${map.id}`);
    }
  }
  for (const c of mine) await request.delete(`/api/collections/${c.id}`);
}

const sidebar = (page: Page) => page.getByRole('navigation', { name: 'Collections' });

async function newCollection(page: Page, name: string) {
  await sidebar(page).getByRole('button', { name: 'New collection' }).click();
  await page.getByLabel('New collection name').fill(name);
  await page.getByLabel('New collection name').press('Enter');
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}

test('create a collection, start a map in it, and come back to it from the editor', async ({
  page,
  unique,
}) => {
  const fems = unique('FEMS');
  await page.goto('/');
  await newCollection(page, fems);
  await expect(page).toHaveURL(/#\/collection\//);
  await expect(page.getByText(`No maps in ${fems} yet`)).toBeVisible();

  await page.getByRole('button', { name: 'New Project plan' }).click();
  await expect(page.locator('[data-node-id=root]')).toBeVisible();
  const back = page.getByRole('button', { name: `Back to ${fems}` });
  await expect(back).toBeVisible();
  await back.click();

  await expect(page.getByRole('heading', { level: 1, name: fems })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open Project plan' })).toBeVisible();
  await expect(
    sidebar(page).getByRole('button', { name: new RegExp(`${fems}\\s*1$`) }),
  ).toBeVisible();

  // On "All maps" the card says which collection it is in; "Not in a collection" doesn't list it.
  await sidebar(page)
    .getByRole('button', { name: /All maps/ })
    .click();
  const card = page.locator('.card', {
    has: page.getByRole('button', { name: 'Open Project plan' }),
  });
  await expect(card.locator('.chip')).toHaveText(fems);
  await sidebar(page)
    .getByRole('button', { name: /Not in a collection/ })
    .click();
  await expect(page.getByRole('button', { name: 'Open Project plan' })).toHaveCount(0);
});

test('move maps between collections with the card menu and by dragging', async ({
  page,
  request,
  unique,
}) => {
  const a = unique('Alpha');
  const b = unique('Beta');
  const title = unique('Loose map');
  const doc = await import('../src/commands/commands').then((m) => m.buildMapDoc(title));
  const Y = await import('yjs');
  await request.post('/api/maps', {
    data: { state: Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64') },
  });

  await page.goto('/#/unsorted');
  await newCollection(page, a);
  await sidebar(page)
    .getByRole('button', { name: /Not in a collection/ })
    .click();
  await newCollection(page, b);
  await sidebar(page)
    .getByRole('button', { name: /Not in a collection/ })
    .click();

  // drag the loose map onto Alpha
  await page
    .locator('.card', { has: page.getByRole('button', { name: `Open ${title}` }) })
    .dragTo(sidebar(page).getByRole('button', { name: new RegExp(a) }));
  await expect(sidebar(page).getByRole('button', { name: new RegExp(`${a}\\s*1$`) })).toBeVisible();
  await expect(page.getByRole('button', { name: `Open ${title}` })).toHaveCount(0);

  // move it from Alpha to Beta with the menu
  await sidebar(page)
    .getByRole('button', { name: new RegExp(a) })
    .click();
  await page.getByRole('button', { name: `Actions for ${title}` }).click();
  await page.getByRole('menuitemradio', { name: b }).click();
  await expect(page.getByText(`No maps in ${a} yet`)).toBeVisible();
  await expect(sidebar(page).getByRole('button', { name: new RegExp(`${b}\\s*1$`) })).toBeVisible();

  // and take it out of any collection
  await sidebar(page)
    .getByRole('button', { name: new RegExp(b) })
    .click();
  await page.getByRole('button', { name: `Actions for ${title}` }).click();
  await page.getByRole('menuitem', { name: 'Remove from collection' }).click();
  await sidebar(page)
    .getByRole('button', { name: /Not in a collection/ })
    .click();
  await expect(page.getByRole('button', { name: `Open ${title}` })).toBeVisible();
});

test('rename, recolour and refuse duplicate names', async ({ page, unique }) => {
  const one = unique('One');
  const two = unique('Two');
  await page.goto('/');
  await newCollection(page, one);
  await newCollection(page, two);

  await sidebar(page).getByRole('button', { name: 'New collection' }).click();
  await page.getByLabel('New collection name').fill(one.toUpperCase());
  await page.getByLabel('New collection name').press('Enter');
  await expect(sidebar(page).getByRole('alert')).toHaveText(
    'There is already a collection with that name',
  );
  await page.getByLabel('New collection name').press('Escape');

  const renamed = unique('Renamed');
  await page.getByRole('button', { name: 'Rename' }).click();
  await page.getByLabel('Collection name').fill(renamed);
  await page.getByLabel('Collection name').press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: renamed })).toBeVisible();
  await expect(sidebar(page).getByRole('button', { name: new RegExp(renamed) })).toBeVisible();

  await page.getByRole('button', { name: 'Collection colour' }).click();
  await page.getByRole('button', { name: 'Colour #e8457c' }).click();
  await expect(page.locator('.collection-head__badge')).toHaveCSS(
    'background-color',
    'rgb(232, 69, 124)',
  );
});

test('deleting a collection keeps its maps unless you choose otherwise', async ({
  page,
  request,
  unique,
}) => {
  const keep = unique('Keep');
  const drop = unique('Drop');
  await page.goto('/');

  await newCollection(page, keep);
  await page.getByRole('button', { name: 'New map' }).click();
  await expect(page.locator('[data-node-id=root]')).toBeVisible();
  const keptId = /#\/map\/([\w-]+)/.exec(page.url())![1]!;
  await page.getByRole('button', { name: `Back to ${keep}` }).click();
  await page.getByRole('button', { name: 'Delete collection' }).click();
  await page.getByRole('button', { name: 'Delete collection, keep maps' }).click();
  await expect(sidebar(page).getByRole('button', { name: new RegExp(keep) })).toHaveCount(0);
  expect((await (await request.get(`/api/maps/${keptId}`)).json()).collectionId).toBeNull();
  await request.delete(`/api/maps/${keptId}`);

  await newCollection(page, drop);
  await page.getByRole('button', { name: 'New map' }).click();
  await expect(page.locator('[data-node-id=root]')).toBeVisible();
  const droppedId = /#\/map\/([\w-]+)/.exec(page.url())![1]!;
  await page.getByRole('button', { name: `Back to ${drop}` }).click();
  await page.getByRole('button', { name: 'Delete collection' }).click();
  await page.getByRole('button', { name: 'Delete it and its 1 map' }).click();
  await expect(sidebar(page).getByRole('button', { name: new RegExp(drop) })).toHaveCount(0);
  await expect.poll(async () => (await request.get(`/api/maps/${droppedId}`)).status()).toBe(404);
});
