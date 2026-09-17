import { TECH } from './fonts.js';

/**
 * Text metrics for the die lettering.
 *
 * The old code assumed a fixed monospace advance. DIN is proportional -
 * `illiIIl` and `MEMWIDTH` are nowhere near the same width - so a constant
 * ratio either truncates names that would have fitted or lets them run past the
 * block edge. These measure for real.
 *
 * Width scales linearly with font size for a given face, so everything is
 * measured once at a reference size and cached in ems. One canvas, one
 * measurement per distinct string.
 */

const REF = 100;

let ctx = null;
const cache = new Map();

function context() {
  if (ctx) return ctx;
  if (typeof document === 'undefined') return null;
  ctx = document.createElement('canvas').getContext('2d');
  ctx.font = `${REF}px ${TECH}`;
  return ctx;
}

/** Width of `text` in ems (multiply by font size for px). */
function emWidth(text) {
  let w = cache.get(text);
  if (w !== undefined) return w;

  const c = context();
  // Fallback ratio only matters before fonts are ready or outside a browser.
  w = c ? c.measureText(text).width / REF : text.length * 0.52;
  cache.set(text, w);
  return w;
}

export const textWidth = (text, fontSize) => emWidth(text) * fontSize;

/**
 * Longest prefix of `text` that fits `maxPx`, with an ellipsis when clipped.
 * Binary search over prefixes; every measurement is cached.
 */
export function truncate(text, maxPx, fontSize, min = 2) {
  if (fontSize <= 0 || maxPx <= 0) return '';
  if (textWidth(text, fontSize) <= maxPx) return text;

  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (textWidth(`${text.slice(0, mid)}…`, fontSize) <= maxPx) lo = mid;
    else hi = mid - 1;
  }
  return lo >= min ? `${text.slice(0, lo)}…` : '';
}

/**
 * Choose the orientation that actually shows the name.
 *
 * A tall narrow block fits three characters across and twenty down, so it gets
 * rotated text - the same way a real floorplan labels a narrow partition. The
 * bias keeps near-square blocks horizontal, where reading is easier.
 *
 * Returns null when the block cannot carry a legible label at all.
 */
export function fitLabel(name, w, h, { maxFont = 10, pad = 8, bias = 1.3, min = 3 } = {}) {
  const fontH = Math.max(5, Math.min(h * 0.26, w * 0.2, maxFont));
  const fontV = Math.max(5, Math.min(w * 0.26, h * 0.2, maxFont));

  const em = emWidth(name);
  // How much of the name each orientation can show, as a fraction.
  const fracH = (w - pad) / (em * fontH);
  const fracV = (h - pad) / (em * fontV);

  const vertical = fracV > fracH * bias;
  const fontSize = vertical ? fontV : fontH;
  const room = (vertical ? h : w) - pad;

  const text = truncate(name, room, fontSize, min);
  if (!text) return null;

  return { vertical, fontSize, text };
}
