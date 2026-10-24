import { test as base, expect, type Page } from '@playwright/test';
import * as Y from 'yjs';
import { buildMapDoc, type OutlineNode } from '../src/commands/commands';
import type { MapSettings } from '../src/model/schema';

export { expect };

/** Shorthand outline: { 'A': { 'A1': {} }, 'B': {} } */
export type Tree = { [text: string]: Tree };

function toOutline(tree: Tree): OutlineNode[] {
  return Object.entries(tree).map(([text, children]) => ({ text, children: toOutline(children) }));
}

interface Fixtures {
  /** Creates a map through the API and opens it in the editor. Deleted after the test. */
  openMap: (title: string, tree?: Tree, settings?: Partial<MapSettings>) => Promise<string>;
  /** Registers a map created through the UI for clean-up. */
  track: (page: Page) => void;
}

export const test = base.extend<Fixtures>({
  openMap: async ({ page, request }, use) => {
    const created: string[] = [];
    await use(async (title, tree = {}, settings = {}) => {
      const doc = buildMapDoc(title, toOutline(tree), settings);
      const state = Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64');
      const response = await request.post('/api/maps', { data: { title, state } });
      const { id } = (await response.json()) as { id: string };
      created.push(id);
      await page.goto(`/#/map/${id}`);
      await expect(page.locator('[data-node-id=root]')).toBeVisible();
      return id;
    });
    for (const id of created) await request.delete(`/api/maps/${id}`);
  },
  track: async ({ request }, use) => {
    const pages: Page[] = [];
    await use((page) => void pages.push(page));
    for (const page of pages) {
      const id = /#\/map\/([\w-]+)/.exec(page.url())?.[1];
      if (id) await request.delete(`/api/maps/${id}`);
    }
  },
});

/** A node on the canvas (the outline panel has tree items too). */
export const node = (page: Page, text: string) =>
  page.locator('.world').getByRole('treeitem', { name: text, exact: true });

export const selected = (page: Page) => page.locator('.world .node.is-selected');

/** Exports the map as a Markdown outline through the UI and returns the file's text. */
export async function outline(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: 'Markdown outline' }).click(),
  ]);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

/** Pastes text into the canvas as if it came from another app. */
export async function pasteText(page: Page, text: string) {
  await page.evaluate((value) => {
    const data = new DataTransfer();
    data.setData('text/plain', value);
    document
      .querySelector('.canvas')!
      .dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }));
  }, text);
}

export async function waitSaved(page: Page) {
  await expect(page.locator('.save-status')).toHaveText('Saved');
}
