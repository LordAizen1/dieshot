import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

const MIN_SCALE = 0.02;
const MAX_SCALE = 140;   // ~1500x on a large die, ~100x on a small one

/**
 * Pan/zoom over a fixed-size world. Wheel zooms about the cursor, drag pans.
 * Hand-rolled: ~60 lines beats a dependency for this.
 *
 * Returns screen = world * s + (x, y).
 */
export function useViewport(ref, world) {
  const [size, setSize] = useState({ w: 1, h: 1 });
  const [view, setView] = useState({ s: 1, x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);

  // Whether the user has taken control of the viewport. Until they have, the
  // view is still "auto" and may be re-fitted; afterwards it is theirs and only
  // an explicit fit moves it.
  const touched = useRef(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setSize({ w: r.width, h: r.height });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);

  const fit = useCallback((pad = 44) => {
    touched.current = false;
    const el = ref.current;
    if (!el || !world?.w || !world?.h) return;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const s = Math.min((r.width - pad * 2) / world.w, (r.height - pad * 2) / world.h);
    const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, s));
    setView({
      s: scale,
      x: (r.width - world.w * scale) / 2,
      y: (r.height - world.h * scale) / 2,
    });
  }, [ref, world?.w, world?.h]);

  /**
   * Re-fit on mount, on a new die, and on container resize - but only while the
   * view is still automatic.
   *
   * The size dependency matters: the first fit can run before the container has
   * settled at its final height, which left the die clipped and off-centre at
   * load until you pressed F. Re-fitting when the measurement changes corrects
   * that without ever yanking the view away from someone who has panned.
   */
  useEffect(() => {
    if (!touched.current) fit();
  }, [fit, size.w, size.h]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const onWheel = (e) => {
      e.preventDefault();
      touched.current = true;
      const r = el.getBoundingClientRect();
      const px = e.clientX - r.left;
      const py = e.clientY - r.top;
      setView((v) => {
        const k = Math.exp(-e.deltaY * 0.0015);
        const s = Math.max(MIN_SCALE, Math.min(MAX_SCALE, v.s * k));
        const f = s / v.s;
        return { s, x: px - (px - v.x) * f, y: py - (py - v.y) * f };
      });
    };

    let origin = null;

    const onDown = (e) => {
      if (e.button !== 0) return;
      touched.current = true;
      origin = { px: e.clientX, py: e.clientY };
      el.setPointerCapture(e.pointerId);
      setDragging(true);
    };

    const onMove = (e) => {
      if (!origin) return;
      const dx = e.clientX - origin.px;
      const dy = e.clientY - origin.py;
      origin = { px: e.clientX, py: e.clientY };
      setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
    };

    const onUp = (e) => {
      if (!origin) return;
      origin = null;
      try { el.releasePointerCapture(e.pointerId); } catch { /* already released */ }
      setDragging(false);
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
    };
  }, [ref]);

  /**
   * The scale at which the whole die fits. Used as the 1x reference for the
   * magnification readout: "how far in am I, relative to seeing the whole
   * chip" is the reading that means something, and unlike raw scale it does
   * not depend on how big this particular die happens to be.
   */
  const fitScale = (() => {
    const pad = 44;
    if (!size.w || !size.h || !world?.w || !world?.h) return 1;
    const s = Math.min((size.w - pad * 2) / world.w, (size.h - pad * 2) / world.h);
    return Math.max(MIN_SCALE, Math.min(MAX_SCALE, s)) || 1;
  })();

  return { view, setView, fit, size, dragging, fitScale };
}
