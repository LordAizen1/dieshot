import { scanDirectory } from './walk.js';
import { collectImports, IMPORT_CAP } from './imports.js';

/**
 * One scan, start to finish: walk the tree, then read the netlist out of it.
 *
 * This exists because there are three callers - the CLI, the dev server's
 * /api/scan, and the standalone server `npx dieshot` starts - and they had
 * drifted. /api/scan only ever ran the walk, so a die scanned from the path
 * box came back with no imports at all and quietly had no traces, while the
 * same directory scanned from the CLI did. Anything that produces a die goes
 * through here now.
 */
export async function scanToDie(target, options = {}) {
  const { maxFiles, maxDepth, includeHidden, imports = true, allImports = false } = options;

  const t0 = Date.now();
  const result = await scanDirectory(target, { maxFiles, maxDepth, includeHidden });
  const walkMs = Date.now() - t0;

  let importMs = 0;
  if (imports) {
    const t1 = Date.now();
    result.imports = await collectImports(result.meta.root, result.files, {
      maxSources: allImports ? 0 : IMPORT_CAP,
    });
    importMs = Date.now() - t1;
  }

  // The flat file list exists only so the netlist can resolve specifiers.
  // Shipping it to the browser would roughly double the payload for nothing.
  delete result.files;

  result.timing = { walkMs, importMs, totalMs: walkMs + importMs };
  return result;
}

export { IMPORT_CAP };
