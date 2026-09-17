#!/usr/bin/env node
/**
 * dieshot, as a one-liner.
 *
 *   npx dieshot [dir] [options]
 *
 * Scans a directory, serves the prebuilt UI, opens a tab. No clone, no Vite at
 * runtime, no dependencies - the bundle in dist/ already has React inside it,
 * so all this needs is a static file server and the scanner.
 *
 * The die is held in memory and served from there rather than written into the
 * package, because a globally installed package directory is frequently not
 * writable, and nobody wants npx leaving files around anyway.
 */
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { scanToDie, IMPORT_CAP } from '../scanner/service.js';
import { DEFAULTS } from '../scanner/walk.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(HERE, '..', 'dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

const HELP = `
dieshot - draws a folder like a chip die

  npx dieshot [dir] [options]

  dir                  what to scan (default: the current directory)

  -p, --port <n>       port to serve on (default 5173, steps up if busy)
      --max-files <n>  stop after this many files (default ${DEFAULTS.maxFiles})
      --max-depth <n>  nesting limit (default ${DEFAULTS.maxDepth})
      --hidden         include dotfiles and dot-directories
      --all-imports    read every source file, not a sample of ${IMPORT_CAP}
      --no-imports     skip imports entirely (faster, but no traces)
      --no-open        do not launch a browser
  -h, --help           this

  Everything stays on your machine. Nothing is uploaded anywhere.
`;

function parseArgs(argv) {
  const args = { dir: null, port: 5173, open: true, options: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-p' || a === '--port') args.port = Number(argv[++i]);
    else if (a === '--max-files') args.options.maxFiles = Number(argv[++i]);
    else if (a === '--max-depth') args.options.maxDepth = Number(argv[++i]);
    else if (a === '--hidden') args.options.includeHidden = true;
    else if (a === '--all-imports') args.options.allImports = true;
    else if (a === '--no-imports') args.options.imports = false;
    else if (a === '--no-open') args.open = false;
    else if (a === '-h' || a === '--help') args.help = true;
    else if (!a.startsWith('-') && args.dir === null) args.dir = a;
  }
  args.dir = path.resolve(args.dir ?? process.cwd());
  return args;
}

const fmtBytes = (n) => {
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = n || 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)}${u[i]}`;
};

function report(die, ms) {
  const { meta } = die;
  console.log(`  ${meta.fileCount.toLocaleString()} files · ` +
              `${meta.dirCount.toLocaleString()} dirs · ` +
              `${fmtBytes(meta.totalBytes)} · ${ms}ms`);

  if (die.imports) {
    const s = die.imports.stats;
    const from = s.capped
      ? `${s.parsed.toLocaleString()} of ${s.sourceFiles.toLocaleString()} source files`
      : `${s.parsed.toLocaleString()} source files`;
    console.log(`  ${s.edges.toLocaleString()} import edges from ${from}`);
    if (s.capped) console.log('  (--all-imports reads the rest, or flip it in the panel)');
  }

  if (meta.truncated) {
    const suggest = Math.ceil((meta.fileCount + meta.ignoredCount) / 10000) * 10000;
    console.log(`\n  NOTE  stopped at ${meta.options.maxFiles} files, so this die is partial.`);
    console.log(`        for all of it:  --max-files ${suggest}`);
  }
}

/** Open a URL in whatever the platform calls a browser. */
function openBrowser(url) {
  const [cmd, cmdArgs] = process.platform === 'win32'
    ? ['cmd', ['/c', 'start', '', url]]
    : process.platform === 'darwin'
      ? ['open', [url]]
      : ['xdg-open', [url]];
  try {
    spawn(cmd, cmdArgs, { stdio: 'ignore', detached: true }).unref();
  } catch {
    /* headless box, no browser: the URL is printed anyway */
  }
}

/** Listen on `port`, stepping up if something already has it. */
function listen(server, port, tries = 10) {
  return new Promise((resolve, reject) => {
    const attempt = (p, left) => {
      server.once('error', (err) => {
        if (err.code === 'EADDRINUSE' && left > 0) attempt(p + 1, left - 1);
        else reject(err);
      });
      server.listen(p, () => resolve(p));
    };
    attempt(port, tries);
  });
}

async function serveStatic(res, urlPath) {
  const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const file = path.join(DIST, rel);

  // Nothing outside dist/, whatever the request says.
  if (!file.startsWith(DIST)) {
    res.statusCode = 403;
    return res.end('forbidden');
  }

  try {
    const body = await fs.readFile(file);
    res.statusCode = 200;
    res.setHeader('Content-Type', MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream');
    res.end(body);
  } catch {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('not found');
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(HELP); return; }

  try {
    const st = await fs.stat(args.dir);
    if (!st.isDirectory()) throw new Error('not a directory');
  } catch {
    console.error(`dieshot: cannot scan ${args.dir}`);
    process.exit(1);
  }

  try {
    await fs.access(path.join(DIST, 'index.html'));
  } catch {
    console.error('dieshot: the bundled UI is missing (dist/). This is a packaging bug.');
    process.exit(1);
  }

  console.log(`\n  scanning ${args.dir}`);
  const t0 = Date.now();
  let die = await scanToDie(args.dir, args.options);
  delete die.timing;
  report(die, Date.now() - t0);

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');

    if (url.pathname === '/die.json') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      return res.end(JSON.stringify(die));
    }

    // Same endpoint the dev server has, so the path box and the imports
    // switch in the panel work identically here.
    if (url.pathname === '/api/scan') {
      const target = url.searchParams.get('path');
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      if (!target) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ error: 'missing ?path=' }));
      }
      try {
        const next = await scanToDie(target, {
          maxFiles: Number(url.searchParams.get('maxFiles')) || undefined,
          allImports: url.searchParams.get('allImports') === '1',
        });
        delete next.timing;
        die = next;                     // so a reload shows what you last asked for
        res.statusCode = 200;
        res.end(JSON.stringify(next));
      } catch (err) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    return serveStatic(res, url.pathname);
  });

  const port = await listen(server, args.port);
  const url = `http://localhost:${port}`;
  console.log(`\n  ${url}    (ctrl-c to stop)\n`);
  if (args.open) openBrowser(url);
}

main().catch((err) => {
  console.error(`dieshot: ${err.message}`);
  process.exit(1);
});
