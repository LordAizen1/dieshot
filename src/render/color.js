/**
 * Minimal HSL colour maths.
 *
 * Exists for one reason: a real die photograph is not monochrome. Layer-stack
 * thickness differences produce thin-film interference, so neighbouring blocks
 * shift in hue and brightness even when they are the same kind of circuit. A
 * flat per-type fill is the single biggest tell that something is a diagram
 * rather than a photograph, so every block gets a deterministic tint variant.
 */

function hexToHsl(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;

  let h = 0;
  let s = 0;
  if (d) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
}

function hslToHex(h, s, l) {
  const hh = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = l - c / 2;

  let rgb;
  if (hh < 60) rgb = [c, x, 0];
  else if (hh < 120) rgb = [x, c, 0];
  else if (hh < 180) rgb = [0, c, x];
  else if (hh < 240) rgb = [0, x, c];
  else if (hh < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];

  const to = (v) => Math.round(Math.max(0, Math.min(255, (v + m) * 255)))
    .toString(16).padStart(2, '0');
  return `#${to(rgb[0])}${to(rgb[1])}${to(rgb[2])}`;
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));

/** Shift a hex colour in HSL space. */
export function shift(hex, dh = 0, ds = 0, dl = 0) {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex(h + dh, clamp01(s + ds), clamp01(l + dl));
}

/**
 * Deterministic variant index from a path: the same block always gets the same
 * tint, so the die does not shimmer when you rescan.
 */
export function variantOf(path, n = 3) {
  let h = 2166136261;
  const s = String(path);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % n;
}

/** Hex to rgba() string, for halos and other semi-transparent paints. */
export function rgba(hex, a) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/** Three interference tints per block type. Index 0 is the base colour. */
export function tints(hex) {
  return [hex, shift(hex, 7, 0.03, 0.022), shift(hex, -9, -0.02, -0.016)];
}
