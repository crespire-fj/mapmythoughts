import { expect, test } from './fixtures';

test('the guide opens from the start page and lists every area of the app', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Guide' }).click();
  await expect(page).toHaveURL(/#\/guide$/);
  await expect(
    page.getByRole('heading', { name: 'Everything Map My Thoughts can do.' }),
  ).toBeVisible();
  const toc = page.getByRole('navigation', { name: 'Guide sections' });
  await expect(toc.getByRole('button')).toHaveCount(12);
  // Pictures come from the app's own data.
  await expect(page.locator('.guide-themes li')).toHaveCount(8);
  await expect(page.locator('.guide-templates li')).toHaveCount(6);
  await expect(page.locator('.guide-markers li')).toHaveCount(7);

  await toc.getByRole('button', { name: 'Version history' }).click();
  await expect(page).toHaveURL(/#\/guide\/history$/);
  await expect(page.getByRole('heading', { name: 'Version history' })).toBeInViewport();
  await expect(toc.getByRole('button', { name: 'Version history' })).toHaveAttribute(
    'aria-current',
    'location',
  );

  await page.getByRole('button', { name: 'Your maps', exact: true }).click();
  await expect(page).toHaveURL(/#\/$/);
});

test('searching and "What’s new" narrow the guide', async ({ page }) => {
  await page.goto('/#/guide');
  const search = page.getByLabel('Search features');
  await search.fill('undo');
  await expect(page.getByRole('heading', { name: 'Undo and redo' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Templates' })).toHaveCount(0);

  await search.fill('share'); // a section title brings its whole section
  await expect(page.getByRole('heading', { name: 'PDF' })).toBeVisible();

  await search.fill('zzzz');
  await expect(page.getByText('Nothing matches “zzzz”.')).toBeVisible();
  await page.getByRole('button', { name: 'show everything' }).click();
  await expect(search).toHaveValue('');

  await page.getByRole('button', { name: /What’s new/ }).click();
  const cards = page.locator('.guide-card');
  await expect(cards.first()).toBeVisible();
  expect(await cards.count()).toBe(await page.locator('.guide-card__new').count());
});

test('a link to a section scrolls to it, and the shortcut panel links to the guide', async ({
  page,
  openMap,
}) => {
  await page.goto('/#/guide/share');
  await expect(page.getByRole('heading', { name: 'Share and export' })).toBeInViewport();

  await openMap('Help', { A: {} });
  await page.getByRole('button', { name: 'Keyboard shortcuts' }).click();
  await page.getByRole('link', { name: 'See everything Map My Thoughts can do' }).click();
  await expect(
    page.getByRole('heading', { name: 'Everything Map My Thoughts can do.' }),
  ).toBeVisible();
});
