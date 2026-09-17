import fs from 'node:fs/promises';
import path from 'node:path';
import { tagDirectory, tagFile } from './tagger.js';

/**
 * Directories that are build output, dependency caches or IDE state. None of
 * them are authored code, so none of them belong on the die.
 */
export const IGNORE_DIRS = new Set([
  'node_modules', '.git', '.hg', '.svn', 'dist', 'build', 'out', 'bin-debug',
  'coverage', '.next', '.nuxt', '.svelte-kit', '.turbo', '.cache', '.parcel-cache',
  '.venv', 'venv', 'env', '__pycache__', '.pytest_cache', '.mypy_cache',
  'target', 'vendor', '.gradle', '.idea', '.kotlin', '.dart_tool', '.vs',
  'Pods', 'DerivedData', '.expo', '.angular', 'bower_components', '.terraform',
  '.vite', '.output', '.sass-cache', 'obj',
]);

export const IGNORE_FILES = new Set([
  '.DS_Store', 'Thumbs.db', 'desktop.ini', 'die.json',
]);

export const DEFAULTS = {
  maxDepth: 14,
  maxFiles: 25000,
  includeHidden: false,
};

const toPosix = (p) => p.split(path.sep).join('/');

/**
 * Walk a directory into a nested tree.
 *
 * Symlinks are never followed (cycle safety) and empty directories are pruned,
 * so every leaf on the die is a real file with real bytes.
 *
 * Returns { meta, tree }.
 */
export async function scanDirectory(rootPath, options = {}) {
  const opts = { ...DEFAULTS, ...options };
  const root = path.resolve(rootPath);

  const stat = await fs.stat(root);
  if (!stat.isDirectory()) {
    throw new Error(`Not a directory: ${root}`);
  }

  const counters = { files: 0, dirs: 0, ignored: 0, bytes: 0, truncated: false };
  // Flat list of every file placed, in walk order. The import pass needs a
  // lookup by path, and edges reference these positions rather than repeating
  // path strings.
  const flat = [];
  const started = Date.now();
  const tree = await walkDir(root, path.basename(root) || root, '', 0, opts, counters, flat);

  return {
    meta: {
      root,
      name: path.basename(root) || root,
      scannedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      fileCount: counters.files,
      dirCount: counters.dirs,
      totalBytes: counters.bytes,
      ignoredCount: counters.ignored,
      truncated: counters.truncated,
      options: { maxDepth: opts.maxDepth, maxFiles: opts.maxFiles },
    },
    files: flat,
    tree: tree || {
      name: path.basename(root) || root,
      path: '',
      kind: 'dir',
      type: 'TYPE_CORE',
      size: 0,
      children: [],
    },
  };
}

async function walkDir(absPath, name, relPath, depth, opts, counters, flat) {
  let entries;
  try {
    entries = await fs.readdir(absPath, { withFileTypes: true });
  } catch {
    counters.ignored++;
    return null;                       // unreadable (permissions, junction, race)
  }

  const children = [];
  let size = 0;
  let dirCount = 0;
  let fileCount = 0;

  // Alphabetical, directories and files interleaved. Stable order is what makes
  // the resulting floorplan diffable across rescans.
  entries.sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const entryName = entry.name;

    if (entry.isSymbolicLink()) { counters.ignored++; continue; }
    if (!opts.includeHidden && entryName.startsWith('.') && entryName !== '.github') {
      counters.ignored++;
      continue;
    }

    const childRel = relPath ? `${relPath}/${entryName}` : entryName;
    const childAbs = path.join(absPath, entryName);

    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entryName)) { counters.ignored++; continue; }
      if (depth + 1 > opts.maxDepth) { counters.ignored++; continue; }

      const child = await walkDir(childAbs, entryName, childRel, depth + 1, opts, counters, flat);
      if (child) {                     // null => unreadable or empty: pruned
        children.push(child);
        size += child.size;
        dirCount++;
      }
      continue;
    }

    if (!entry.isFile()) { counters.ignored++; continue; }
    if (IGNORE_FILES.has(entryName)) { counters.ignored++; continue; }

    if (counters.files >= opts.maxFiles) {
      counters.truncated = true;
      counters.ignored++;
      continue;
    }

    let bytes = 0;
    try {
      bytes = (await fs.stat(childAbs)).size;
    } catch {
      counters.ignored++;
      continue;
    }

    const fileNode = {
      name: entryName,
      path: toPosix(childRel),
      kind: 'file',
      size: bytes,
      ...tagFile(entryName, bytes),
    };
    children.push(fileNode);
    flat.push(fileNode);

    size += bytes;
    fileCount++;
    counters.files++;
    counters.bytes += bytes;
  }

  if (children.length === 0) return null;   // prune empty directories

  counters.dirs++;

  return {
    name,
    path: toPosix(relPath),
    kind: 'dir',
    type: tagDirectory(name, { dirCount, fileCount }),
    size,
    children,
  };
}
