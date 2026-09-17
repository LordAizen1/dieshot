import path from 'node:path';
import { TYPE_IC, familyOf, packageOf, tagDirectory } from '../shared/types.js';

/**
 * Tag a file as an IC. `family` drives colour, `package` drives which sides
 * carry pins. Extensionless files (Dockerfile, LICENSE) fall back to matching
 * on the basename.
 */
export function tagFile(name, size) {
  const ext = path.extname(name).replace(/^\./, '').toLowerCase();
  const key = ext || name.toLowerCase();
  return {
    type: TYPE_IC,
    ext,
    family: familyOf(key),
    package: packageOf(size),
  };
}

export { tagDirectory };
