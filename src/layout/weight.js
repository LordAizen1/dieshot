/**
 * Size -> area weight.
 *
 * The scan JSON always stores honest raw byte counts. The transform is applied
 * here, at layout time, so the same scan can be re-floorplanned under different
 * area semantics without rescanning.
 *
 * A directory's weight is the SUM OF ITS CHILDREN'S TRANSFORMED WEIGHTS, never
 * the transform of its summed bytes. That composition is what keeps a folder's
 * area equal to the area of the files inside it.
 */
export const WEIGHT_MODES = {
  /** Compresses outliers: a 2MB asset stays big without eating the die. */
  sqrt: (bytes) => Math.sqrt(Math.max(bytes, 1)),
  /** Heavier compression - useful when one vendored blob dominates. */
  log: (bytes) => Math.log2(Math.max(bytes, 1) + 1),
  /** Area exactly proportional to file size. Honest, often lopsided. */
  linear: (bytes) => Math.max(bytes, 1),
  /** Every file equal: a pure structure view, size ignored. */
  count: () => 1,
};

export const WEIGHT_MODE_KEYS = Object.keys(WEIGHT_MODES);

export const WEIGHT_MODE_HELP = {
  sqrt: 'sqrt(bytes) - outliers compressed',
  log: 'log2(bytes) - outliers flattened',
  linear: 'bytes - true die area',
  count: '1 per file - structure only',
};
