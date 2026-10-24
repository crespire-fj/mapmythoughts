import { Server } from '@hocuspocus/server';
import { Database } from '@hocuspocus/extension-database';
import { handleApi, isMapId } from './api.ts';
import { backfillStats, loadState, mapExists, migrate, storeState } from './db.ts';
import { docFromState, statsOf } from './stats.ts';

await migrate();
await backfillStats((state) => statsOf(docFromState(state)));

const server = new Server({
  port: Number(process.env.PORT ?? 1234),
  address: '0.0.0.0',
  quiet: true,
  // Save within a second of the last edit, and at least every 5 seconds while typing.
  debounce: 1000,
  maxDebounce: 5000,

  async onConnect({ documentName }) {
    if (!isMapId(documentName) || !(await mapExists(documentName))) {
      throw new Error(`Unknown map ${documentName}`);
    }
  },

  async onRequest({ request, response, instance }) {
    if (await handleApi(request, response, instance)) {
      // Rejecting with no error tells Hocuspocus the response has already been sent.
      return Promise.reject();
    }
  },

  extensions: [
    new Database({
      fetch: async ({ documentName }) => loadState(documentName),
      store: async ({ documentName, state, document }) => {
        await storeState(documentName, statsOf(document), state);
      },
    }),
  ],
});

await server.listen();
console.log(`Map My Thoughts sync server listening on :${server.address.port}`);
