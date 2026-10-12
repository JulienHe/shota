import WEB_GRADIENTS from "./webgradients.json";

/**
 * Background gradients: thirty from the WebGradients collection by itmeo,
 * MIT licensed (see THIRD_PARTY_NOTICES.md), kept as data in
 * webgradients.json exactly as published, so each looks here the way it
 * does on webgradients.com.
 *
 * Thirty rather than all 174: the full set was a long scroll of near
 * duplicates. These were picked by eye to each be a clearly different
 * colour, and the file lists them in the order the panel shows them, a
 * row per family: warm, pink and purple, blue, green, dark, soft.
 *
 * Drawn into a small canvas and stretched to the frame rather than shipped
 * as images: a gradient has no detail to lose, so rendering one at full 4K
 * resolution would only cost time.
 */

export interface Gradient {
  id: string;
  name: string;
  /** CSS angle: 0 points up, 90 right, increasing clockwise. */
  deg: number;
  /** [colour, position 0 to 100], in order. */
  stops: [string, number][];
}

export const GRADIENTS = WEB_GRADIENTS as Gradient[];

/**
 * Draws a CSS `linear-gradient(deg, …)` onto a canvas, with the same
 * geometry CSS uses: the gradient line runs through the centre at the given
 * angle, just long enough that its ends touch the far corners.
 */
function draw(gradient: Gradient, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  const rad = (gradient.deg * Math.PI) / 180;
  const dx = Math.sin(rad);
  const dy = -Math.cos(rad);
  const half = (Math.abs(width * dx) + Math.abs(height * dy)) / 2;
  const cx = width / 2;
  const cy = height / 2;
  const fill = ctx.createLinearGradient(cx - dx * half, cy - dy * half, cx + dx * half, cy + dy * half);
  for (const [color, pos] of gradient.stops) {
    fill.addColorStop(Math.min(1, Math.max(0, pos / 100)), color);
  }
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, width, height);
  return canvas;
}

const cache = new Map<string, HTMLCanvasElement>();

/** The gradient as a canvas at an aspect ratio matching the frame, so the
 * angle comes out as designed rather than skewed by stretching. Cached per
 * shape of frame. */
export function gradientCanvas(id: string, aspect: number): HTMLCanvasElement | null {
  const gradient = GRADIENTS.find((g) => g.id === id);
  if (!gradient) return null;
  // Rounded so dragging the padding slider doesn't redraw on every pixel.
  const ratio = Math.round(aspect * 20) / 20;
  const key = `${id}:${ratio}`;
  let canvas = cache.get(key);
  if (!canvas) {
    const width = 960;
    canvas = draw(gradient, width, Math.max(1, Math.round(width / ratio)));
    cache.set(key, canvas);
  }
  return canvas;
}

/** The same gradient as CSS, for the panel's swatches. */
export function gradientCss(gradient: Gradient): string {
  return `linear-gradient(${gradient.deg}deg, ${gradient.stops.map(([c, p]) => `${c} ${p}%`).join(", ")})`;
}
