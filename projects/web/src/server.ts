import {
  createNodeRequestHandler,
  isMainModule,
} from '@angular/ssr/node';
import { join } from 'node:path';

import { buildApp } from './server/app';

const browserDistFolder = join(
  import.meta.dirname,
  '../browser',
);

type App = ReturnType<typeof buildApp>;
const globals = globalThis as { acquireApp?: App };

// Reused across dev-server reloads so live games and ports persist.
const app = (globals.acquireApp ??= buildApp({
  browserDistFolder,
}));

if (isMainModule(import.meta.url) || process.env['pm_id']) {
  const port = Number(process.env['PORT'] ?? 4000);
  const host = process.env['HOST'] ?? '0.0.0.0';
  app.listen({ host, port }).catch((error: unknown) => {
    app.log.error(error);
    process.exit(1);
  });
} else if (process.env['ACQUIRE_DEV_WS_PORT']) {
  // `ng serve` only forwards plain HTTP requests to the handler
  // below, so WebSockets are proxied to this listener instead.
  const port = Number(process.env['ACQUIRE_DEV_WS_PORT']);
  if (!app.server.listening) {
    app
      .listen({ host: '127.0.0.1', port })
      .catch(() => undefined);
  }
}

/**
 * Request handler used by the Angular CLI (dev server and build).
 */
export const reqHandler = createNodeRequestHandler(
  async (req, res) => {
    await app.ready();
    app.server.emit('request', req, res);
  },
);
