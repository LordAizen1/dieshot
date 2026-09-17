import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { scanToDie } from './scanner/service.js';

const SCAN_TIMEOUT_MS = 180_000;

/**
 * Dev-only endpoint so you can re-floorplan any directory from the UI without
 * restarting anything: GET /api/scan?path=E:\some\repo
 *
 * This is a local tool - it reads whatever local path you hand it, exactly like
 * the CLI does. It is not registered for `vite build`.
 */
function scanApi() {
  return {
    name: 'dieshot-scan-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/scan', async (req, res) => {
        const send = (code, body) => {
          res.statusCode = code;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(body));
        };

        try {
          const url = new URL(req.url, 'http://localhost');
          const target = url.searchParams.get('path');
          if (!target) return send(400, { error: 'missing ?path=' });

          const maxFiles = Number(url.searchParams.get('maxFiles')) || undefined;
          const allImports = url.searchParams.get('allImports') === '1';

          // The scan itself is not cancellable; the race just stops the browser
          // from hanging if someone points this at a whole drive.
          const result = await Promise.race([
            scanToDie(target, { maxFiles, allImports }),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error(`scan exceeded ${SCAN_TIMEOUT_MS / 1000}s`)), SCAN_TIMEOUT_MS)),
          ]);

          send(200, result);
        } catch (err) {
          send(500, { error: err.message });
        }
      });
    },
  };
}

/**
 * Reload the page when a new scan lands.
 *
 * Vite does not watch public/ for this, so re-running `npm run scan` left the
 * old die on screen until you remembered to refresh. Now the tab just updates.
 */
function reloadOnScan() {
  return {
    name: 'dieshot-reload-on-scan',
    apply: 'serve',
    configureServer(server) {
      const die = path.resolve('public/die.json');
      server.watcher.add(die);
      server.watcher.on('add', (f) => f === die && reload(server));
      server.watcher.on('change', (f) => f === die && reload(server));
    },
  };
}

const reload = (server) => (server.hot ?? server.ws).send({ type: 'full-reload' });

export default defineConfig({
  plugins: [react(), scanApi(), reloadOnScan()],
  // open: true so `npm run dev` puts the thing on screen instead of printing
  // a URL and expecting you to go type it in.
  server: { port: 5173, open: true },
  preview: { port: 4173, open: true },
});
