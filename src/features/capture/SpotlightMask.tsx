import { CSSProperties } from "react";

export interface HoleRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Dims the whole overlay except for one rectangle, and animates smoothly as
 * that rectangle moves from window to window.
 *
 * Built from four panels around the hole rather than one element with a
 * giant `box-shadow` spread (the obvious way to punch a hole, and what this
 * replaced). The shadow version made every animation frame recompute and
 * repaint a screen-sized blur-less shadow — on a 4K or multi-monitor desktop
 * that is a lot of pixels per frame for something tracking the pointer.
 *
 * Each panel is instead a full-size div moved and resized purely by
 * `transform`, which the compositor can animate on its own: no layout, no
 * repaint, just four already-rasterised layers being placed. Sizing is a
 * `scale` of the full overlay rather than a width/height, because scaling
 * composites while width/height does not.
 *
 * A null `hole` collapses to a zero-size rectangle in the middle, which
 * leaves the panels covering everything — so "nothing hovered" is a plain
 * full dim, reached by the same animation rather than by swapping elements
 * in and out.
 */
export function SpotlightMask({ hole }: { hole: HoleRect | null }) {
  // Read at render rather than held in state: the overlay re-renders on
  // pointer move anyway, so this is always current, and a stale value would
  // only persist for a single frame after a resize.
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const h = hole ?? { left: vw / 2, top: vh / 2, width: 0, height: 0 };
  const right = h.left + h.width;
  const bottom = h.top + h.height;

  const panel = (x: number, y: number, w: number, hgt: number): CSSProperties => ({
    // scale(0) is legal and collapses the panel entirely, which is what the
    // edge cases (a window flush against a screen edge) need.
    transform: `translate(${x}px, ${y}px) scale(${Math.max(0, w) / vw}, ${Math.max(0, hgt) / vh})`,
  });

  return (
    <>
      <div className="capture-overlay__mask" style={panel(0, 0, vw, h.top)} />
      <div className="capture-overlay__mask" style={panel(0, bottom, vw, vh - bottom)} />
      <div className="capture-overlay__mask" style={panel(0, h.top, h.left, h.height)} />
      <div className="capture-overlay__mask" style={panel(right, h.top, vw - right, h.height)} />
    </>
  );
}
