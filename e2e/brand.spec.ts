import { expect, node, test } from './fixtures';

test('the app is branded Map My Thoughts, with its icon and app manifest', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Map My Thoughts');
  await expect(page.locator('.home__bar .brand')).toHaveText('Map My Thoughts');
  await expect(page.locator('link[rel=icon]')).toHaveAttribute('href', '/favicon.svg');

  const manifest = await request.get('/manifest.webmanifest');
  expect(manifest.ok()).toBe(true);
  expect(manifest.headers()['content-type']).toBe('application/manifest+json');
  const data = await manifest.json();
  expect(data.name).toBe('Map My Thoughts');
  for (const icon of data.icons as { src: string }[]) {
    const response = await request.get(icon.src);
    expect(response.headers()['content-type'], icon.src).toBe('image/png');
  }
  expect((await request.get('/apple-touch-icon.png')).headers()['content-type']).toBe('image/png');
});

test('a new blank map uses the Daydream brand theme', async ({ page, request }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New map', exact: true }).click();
  await expect(page.locator('[data-node-id=root]')).toHaveAttribute('style', /#3b2a8c.*#6d4aff/i);
  const id = page.url().split('/').pop()!;
  await page.keyboard.press('Tab');
  await page.keyboard.type('First');
  await page.keyboard.press('Escape');
  await expect(node(page, 'First')).toHaveCSS('background-color', 'rgb(109, 74, 255)');
  await request.delete(`/api/maps/${id}`);
});
