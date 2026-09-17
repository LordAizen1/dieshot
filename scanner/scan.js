#!/usr/bin/env node
/**
 * DIESHOT scanner CLI.
 *
 *   node scanner/scan.js <dir> [-o public/die.json] [--max-depth N]
 *                             [--max-files N] [--hidden]
 *
 * Writes the nested JSON tree the layout engine floorplans.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanDirectory, DEFAULTS } from './walk.js';
import { collectImports } from './imports.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(HERE, '..');
const DEFAULT_OUT = path.join(PROJECT_ROOT, 'public', 'die.json');

function parseArgs(argv) {
  const args = { dir: null, out: DEFAULT_OUT, options: {} };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-o' || a === '--out') {
      args.out = path.resolve(argv[++i]);
    } else if (a === '--max-depth') {
      args.options.maxDepth = Number(argv[++i]);
    } else if (a === '--max-files') {
      args.options.maxFiles = Number(argv[++i]);
    } else if (a === '--hidden') {
      args.options.includeHidden = true;
    } else if (a === '--no-imports') {
      args.noImports = true;
    } else if (a === '-h' || a === '--help') {
      args.help = true;
    } else if (!a.startsWith('-') && args.dir === null) {
      args.dir = a;
    }
  }

  if (args.dir === null) args.dir = PROJECT_ROOT;
  return args;
}

const HELP = `
DIESHOT scanner

  node scanner/scan.js <dir> [options]

  -o, --out <file>     output JSON (default public/die.json)
      --max-depth <n>  nesting limit (default ${DEFAULTS.maxDepth})
      --max-files <n>  file limit   (default ${DEFAULTS.maxFiles})
      --hidden         include dotfiles and dot-directories
      --no-imports     skip dependency extraction (faster scan, no traces)
`;

const fmtBytes = (n) => {
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)}${u[i]}`;
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(HELP); return; }

  const t0 = Date.now();
  const result = await scanDirectory(args.dir, args.options);

  // The netlist: which file references which. The router draws these as traces.
  let importMs = 0;
  if (!args.noImports) {
    const t1 = Date.now();
    result.imports = await collectImports(result.meta.root, result.files);
    importMs = Date.now() - t1;
  }
  delete result.files;   // the flat list exists only to build the netlist

  await fs.mkdir(path.dirname(args.out), { recursive: true });
  await fs.writeFile(args.out, JSON.stringify(result), 'utf8');

  const { meta } = result;
  const outBytes = (await fs.stat(args.out)).size;

  console.log(`  root     ${meta.root}`);
  console.log(`  files    ${meta.fileCount}`);
  console.log(`  dirs     ${meta.dirCount}`);
  console.log(`  bytes    ${fmtBytes(meta.totalBytes)}`);
  console.log(`  skipped  ${meta.ignoredCount}`);
  if (result.imports) {
    const s = result.imports.stats;
    console.log(`  imports  ${s.edges} edges from ${s.parsed} source files ` +
                `(${s.unresolved} unresolved/external, ${importMs}ms)`);
  }
  console.log(`  out      ${args.out} (${fmtBytes(outBytes)})`);
  console.log(`  took     ${Date.now() - t0}ms`);

  if (meta.truncated) {
    const suggest = Math.ceil((meta.fileCount + meta.ignoredCount) / 10000) * 10000;
    console.log('');
    console.log(`  NOTE  stopped at ${meta.options.maxFiles} files, so this die is incomplete.`);
    console.log(`        for the whole thing:  npm run scan -- "${args.dir}" --max-files ${suggest}`);
  }
}

main().catch((err) => {
  console.error(`scan failed: ${err.message}`);
  process.exit(1);
});
