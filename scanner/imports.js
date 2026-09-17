import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Dependency extraction: the netlist.
 *
 * Regex, not an AST. A parser per language would be more correct and vastly
 * more dependency and more time; what the die needs is which files reference
 * which, and a missed edge costs one trace out of thousands. Anything that
 * resolves outside the scanned tree (a package, a stdlib module) is dropped -
 * it has no block to terminate on.
 */

const JS_EXT = new Set(['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'vue', 'svelte']);
const JVM_EXT = new Set(['kt', 'kts', 'java']);
const PY_EXT = new Set(['py']);

/** Read at most this much of a file; imports live at the top. */
const HEAD_BYTES = 64 * 1024;

const JS_PATTERNS = [
  /\bimport\s+[^;'"]*?\bfrom\s*['"]([^'"]+)['"]/g,   // import x from 'y'
  /\bimport\s*['"]([^'"]+)['"]/g,                     // import 'y'
  /\bexport\s+[^;'"]*?\bfrom\s*['"]([^'"]+)['"]/g,    // export * from 'y'
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,          // require('y')
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,           // import('y')
];

const JVM_PATTERN = /^[ \t]*import[ \t]+(?:static[ \t]+)?([\w.]+)/gm;
const PY_PATTERNS = [
  /^[ \t]*from[ \t]+([.\w]+)[ \t]+import\b/gm,
  /^[ \t]*import[ \t]+([\w.]+)/gm,
];

function matchAll(text, patterns) {
  const out = [];
  for (const re of patterns) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) out.push(m[1]);
  }
  return out;
}

function specifiersFor(text, ext) {
  if (JS_EXT.has(ext)) return matchAll(text, JS_PATTERNS);
  if (JVM_EXT.has(ext)) return matchAll(text, [JVM_PATTERN]);
  if (PY_EXT.has(ext)) return matchAll(text, PY_PATTERNS);
  return [];
}

const isSource = (ext) => JS_EXT.has(ext) || JVM_EXT.has(ext) || PY_EXT.has(ext);

const dropExt = (p) => p.replace(/\.[^./]+$/, '');
const posix = (p) => p.split(path.sep).join('/');

/**
 * Index the scanned files so specifiers can be resolved back to real blocks.
 */
function buildIndex(files) {
  const byPath = new Set(files.map((f) => f.path));
  const byNoExt = new Map();
  const byBasename = new Map();

  for (const f of files) {
    const noExt = dropExt(f.path);
    if (!byNoExt.has(noExt)) byNoExt.set(noExt, f.path);

    const base = noExt.slice(noExt.lastIndexOf('/') + 1);
    let list = byBasename.get(base);
    if (!list) byBasename.set(base, (list = []));
    list.push(f.path);
  }
  return { byPath, byNoExt, byBasename };
}

const JS_TRIES = ['', '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs',
  '/index.js', '/index.jsx', '/index.ts', '/index.tsx'];

function resolveJs(fromPath, spec, idx) {
  // Bare specifiers are packages: no block on this die to terminate on.
  if (!spec.startsWith('.')) return null;

  const dir = fromPath.includes('/') ? fromPath.slice(0, fromPath.lastIndexOf('/')) : '';
  const joined = posix(path.posix.normalize(`${dir}/${spec}`));

  for (const suffix of JS_TRIES) {
    const cand = joined + suffix;
    if (idx.byPath.has(cand)) return cand;
  }
  // `./foo` where foo.ts exists is covered above; this catches odd extensions.
  return idx.byNoExt.get(joined) ?? null;
}

function resolveJvm(spec, idx) {
  // com.example.Thing -> a file called Thing whose path carries com/example.
  const dotted = spec.split('.');
  const cls = dotted[dotted.length - 1];
  const pkgPath = dotted.slice(0, -1).join('/');

  const candidates = idx.byBasename.get(cls);
  if (!candidates) return null;
  if (candidates.length === 1) return candidates[0];

  const best = candidates.find((p) => p.includes(`${pkgPath}/`));
  return best ?? candidates[0];
}

function resolvePy(fromPath, spec, idx) {
  const dir = fromPath.includes('/') ? fromPath.slice(0, fromPath.lastIndexOf('/')) : '';

  // Leading dots are relative levels: `from ..pkg import x`.
  const lead = /^\.+/.exec(spec);
  let base = dir;
  let rest = spec;
  if (lead) {
    rest = spec.slice(lead[0].length);
    for (let i = 1; i < lead[0].length; i++) {
      base = base.includes('/') ? base.slice(0, base.lastIndexOf('/')) : '';
    }
  }

  const asPath = rest.split('.').filter(Boolean).join('/');
  const joined = posix(path.posix.normalize(`${lead ? base : ''}/${asPath}`)).replace(/^\//, '');

  for (const cand of [`${joined}.py`, `${joined}/__init__.py`]) {
    if (idx.byPath.has(cand)) return cand;
  }
  return null;
}

/**
 * Read every source file and resolve its imports to other files in the tree.
 *
 * Returns { files, edges } where edges are index pairs into `files` - far more
 * compact than repeating path strings, which matters when a large repo produces
 * tens of thousands of them.
 */
export async function collectImports(root, files, { concurrency = 48 } = {}) {
  const sources = files.filter((f) => isSource(f.ext) && f.size <= HEAD_BYTES * 8);
  const idx = buildIndex(files);
  const indexOf = new Map(files.map((f, i) => [f.path, i]));

  const edges = [];
  const seen = new Set();
  let parsed = 0;
  let unresolved = 0;

  let cursor = 0;
  const worker = async () => {
    for (;;) {
      const i = cursor++;
      if (i >= sources.length) return;
      const f = sources[i];

      let text;
      try {
        const fh = await fs.open(path.join(root, f.path), 'r');
        try {
          const buf = Buffer.alloc(Math.min(HEAD_BYTES, f.size));
          await fh.read(buf, 0, buf.length, 0);
          text = buf.toString('utf8');
        } finally {
          await fh.close();
        }
      } catch {
        continue;
      }
      parsed++;

      const from = indexOf.get(f.path);
      for (const spec of specifiersFor(text, f.ext)) {
        let target = null;
        if (JS_EXT.has(f.ext)) target = resolveJs(f.path, spec, idx);
        else if (JVM_EXT.has(f.ext)) target = resolveJvm(spec, idx);
        else if (PY_EXT.has(f.ext)) target = resolvePy(f.path, spec, idx);

        if (!target) { unresolved++; continue; }
        const to = indexOf.get(target);
        if (to === undefined || to === from) continue;

        const key = from * files.length + to;
        if (seen.has(key)) continue;
        seen.add(key);
        edges.push([from, to]);
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, worker));

  return {
    files: files.map((f) => f.path),
    edges,
    stats: { sourceFiles: sources.length, parsed, edges: edges.length, unresolved },
  };
}
