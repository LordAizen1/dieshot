/**
 * DIESHOT - block taxonomy.
 *
 * Single source of truth, imported by BOTH the Node scanner and the browser
 * bundle. Plain ESM: no dependencies, no platform APIs, no JSX.
 */

export const TYPE_MEMORY     = 'TYPE_MEMORY';
export const TYPE_PARALLEL   = 'TYPE_PARALLEL';
export const TYPE_CORE       = 'TYPE_CORE';
export const TYPE_PERIPHERAL = 'TYPE_PERIPHERAL';
export const TYPE_IO         = 'TYPE_IO';
export const TYPE_TEST       = 'TYPE_TEST';
export const TYPE_IC         = 'TYPE_IC';

export const MACRO_TYPES = [
  TYPE_CORE, TYPE_MEMORY, TYPE_PARALLEL, TYPE_PERIPHERAL, TYPE_IO, TYPE_TEST,
];

/** Short silicon-style tag stamped on each macro block. */
export const TYPE_LABEL = {
  [TYPE_MEMORY]: 'MEM',
  [TYPE_PARALLEL]: 'ARRAY',
  [TYPE_CORE]: 'CORE',
  [TYPE_PERIPHERAL]: 'PERIPH',
  [TYPE_IO]: 'PHY',
  [TYPE_TEST]: 'TEST',
  [TYPE_IC]: 'IC',
};

/**
 * Directory name -> hardware block type. FIRST MATCH WINS, so order matters:
 * TEST is probed before MEMORY so a test/fixtures dir does not read as a
 * memory bank.
 *
 * This table is the entire tagging heuristic. Retune the visualization here.
 */
export const TAG_RULES = [
  { type: TYPE_TEST, names: [
    'test', 'tests', '__tests__', 'spec', 'specs', 'e2e', 'cypress', 'testing',
    'androidtest', 'unittest', 'jest', 'playwright', 'benchmark', 'benchmarks',
  ] },
  { type: TYPE_MEMORY, names: [
    'model', 'models', 'db', 'database', 'schema', 'schemas', 'migration',
    'migrations', 'store', 'stores', 'state', 'reducer', 'reducers', 'entity',
    'entities', 'data', 'dataset', 'fixture', 'fixtures', 'seed', 'seeds',
    'prisma', 'orm', 'repository', 'repositories', 'dao', 'cache', 'room',
    'persistence', 'datastore',
  ] },
  { type: TYPE_PARALLEL, names: [
    'component', 'components', 'ui', 'view', 'views', 'page', 'pages', 'screen',
    'screens', 'widget', 'widgets', 'template', 'templates', 'partial',
    'partials', 'layout', 'layouts', 'element', 'elements', 'icon', 'icons',
    'card', 'cards', 'compose', 'fragments', 'activities',
  ] },
  { type: TYPE_IO, names: [
    'api', 'routes', 'router', 'controller', 'controllers', 'http', 'network',
    'net', 'graphql', 'rpc', 'grpc', 'endpoint', 'endpoints', 'socket',
    'remote', 'gateway', 'transport',
  ] },
  { type: TYPE_CORE, names: [
    'core', 'src', 'app', 'main', 'service', 'services', 'engine', 'kernel',
    'domain', 'business', 'usecase', 'usecases', 'handler', 'handlers', 'logic',
    'feature', 'features', 'module', 'modules', 'viewmodel', 'viewmodels',
    'manager', 'managers', 'java', 'kotlin',
  ] },
  { type: TYPE_PERIPHERAL, names: [
    'util', 'utils', 'lib', 'libs', 'library', 'helper', 'helpers', 'common',
    'shared', 'config', 'configs', 'setting', 'settings', 'script', 'scripts',
    'tool', 'tools', 'bin', 'type', 'types', 'typings', 'constant', 'constants',
    'middleware', 'adapter', 'adapters', 'asset', 'assets', 'public', 'static',
    'style', 'styles', 'css', 'theme', 'themes', 'doc', 'docs', 'res',
    'resources', 'gradle', 'extensions', 'di', 'injection', 'hook', 'hooks',
  ] },
];

/**
 * How each block type prefers to be sliced. Consumed by the layout engine.
 *
 *   force     - always cut on `axis`, never flipped. Repeated vertical cuts
 *               produce column strips: DRAM bank geometry.
 *   alternate - strict V,H,V,H by cut depth. A balanced binary tree of
 *               alternating cuts IS a grid array.
 *   ribbon    - always cut the SHORT dimension, producing long thin strips
 *               stacked like an I/O ring.
 *   squarify  - always cut the LONG dimension, so children trend square.
 */
export const LAYOUT_POLICY = {
  [TYPE_MEMORY]:     { mode: 'force', axis: 'V' },
  [TYPE_PARALLEL]:   { mode: 'alternate', start: 'V' },
  [TYPE_PERIPHERAL]: { mode: 'ribbon' },
  [TYPE_TEST]:       { mode: 'ribbon' },
  [TYPE_CORE]:       { mode: 'squarify' },
  [TYPE_IO]:         { mode: 'squarify' },
  [TYPE_IC]:         { mode: 'squarify' },
};

/* ------------------------------------------------------------------ files */

const EXT_FAMILY = {
  logic: ['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'py', 'rb', 'go', 'rs',
          'java', 'kt', 'kts', 'c', 'h', 'cc', 'cpp', 'hpp', 'cs', 'swift',
          'php', 'sh', 'ps1', 'dart', 'scala', 'ex', 'exs', 'lua', 'vue',
          'svelte', 'sql', 'r', 'mm'],
  config: ['json', 'yml', 'yaml', 'toml', 'ini', 'env', 'xml', 'gradle',
           'properties', 'lock', 'cfg', 'conf', 'plist', 'gitignore',
           'editorconfig', 'dockerfile', 'pro'],
  style: ['css', 'scss', 'sass', 'less', 'styl'],
  doc: ['md', 'mdx', 'txt', 'rst', 'adoc', 'pdf', 'docx', 'license'],
  asset: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'ttf', 'otf',
          'woff', 'woff2', 'mp3', 'mp4', 'wav', 'webm', 'zip', 'jar', 'apk',
          'bin', 'so', 'dll', 'exe'],
};

const FAMILY_BY_EXT = (() => {
  const m = new Map();
  for (const [family, exts] of Object.entries(EXT_FAMILY)) {
    for (const e of exts) m.set(e, family);
  }
  return m;
})();

export const FAMILIES = ['logic', 'config', 'style', 'doc', 'asset', 'misc'];

export function familyOf(ext) {
  return FAMILY_BY_EXT.get(String(ext || '').toLowerCase()) || 'misc';
}

/**
 * Package style by byte size. Decides which SIDES carry pins; the pin COUNT is
 * derived from the placed rectangle at layout time, so packages never overflow.
 */
export function packageOf(bytes) {
  if (bytes < 1024) return 'SOT';
  if (bytes < 6 * 1024) return 'SOIC';
  if (bytes < 25 * 1024) return 'DIP';
  return 'QFP';
}

export const PKG_SIDES = {
  SOT:  ['left', 'right'],
  SOIC: ['left', 'right'],
  DIP:  ['left', 'right'],
  QFP:  ['top', 'right', 'bottom', 'left'],
};

export const PKG_MAX_PINS = { SOT: 2, SOIC: 8, DIP: 14, QFP: 16 };

/**
 * Tag a directory. Falls back on composition when the name says nothing:
 * mostly-directories reads as a core cluster, mostly-files as glue logic.
 */
export function tagDirectory(name, { dirCount = 0, fileCount = 0 } = {}) {
  const n = String(name).toLowerCase().replace(/^[._]+/, '');
  for (const rule of TAG_RULES) {
    if (rule.names.includes(n)) return rule.type;
  }
  return dirCount > fileCount ? TYPE_CORE : TYPE_PERIPHERAL;
}
