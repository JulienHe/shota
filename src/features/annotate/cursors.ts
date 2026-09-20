/**
 * Custom cursors built from Lucide icon path data, rendered as inline SVG
 * data URIs. Windows has no built-in "move" or "rotate" cursor that matches
 * the rest of the app's iconography, so these draw the icon twice (a wider
 * white halo behind a dark stroke) so it stays visible over both light and
 * dark screenshot content.
 */
function iconCursor(paths: string[], hotspot = 12): string {
  const strokes = paths.map((d) => `<path d='${d}'/>`).join("");
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'>` +
    `<g fill='none' stroke='white' stroke-width='4' stroke-linecap='round' stroke-linejoin='round'>${strokes}</g>` +
    `<g fill='none' stroke='#1c1d22' stroke-width='1.75' stroke-linecap='round' stroke-linejoin='round'>${strokes}</g>` +
    `</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${hotspot} ${hotspot}`;
}

/** Lucide "move" icon — used while hovering/dragging a shape on the canvas. */
export const MOVE_CURSOR = `${iconCursor([
  "M12 2v20",
  "m15 19-3 3-3-3",
  "m19 9 3 3-3 3",
  "M2 12h20",
  "m5 9-3 3 3 3",
  "m9 5 3-3 3 3",
])}, move`;

/** Lucide "rotate-cw" icon — used for the Transformer's rotation handle. */
export const ROTATE_CURSOR = `${iconCursor([
  "M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8",
  "M21 3v5h-5",
])}, alias`;
