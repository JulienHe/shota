/**
 * Background gradients, drawn rather than shipped as images.
 *
 * Each is a two-stop base plus a few soft colour blobs, which is what gives
 * the "mesh" look of the gradients people expect from tools like this,
 * rather than a flat two-colour fade. Drawn once into a small canvas and
 * stretched to the frame: a gradient has no detail to lose, so rendering it
 * at full 4K resolution would only cost time.
 */

interface Blob {
  /** Centre, as fractions of the width and height. */
  x: number;
  y: number;
  /** Radius, as a fraction of the longer side. */
  r: number;
  color: string;
}

export interface GradientPreset {
  id: string;
  from: string;
  to: string;
  /** Degrees, 0 = left to right. */
  angle: number;
  blobs: Blob[];
}

export const GRADIENTS: GradientPreset[] = [
  { id: "candy", from: "#ff6a88", to: "#7f5af0", angle: 135, blobs: [{ x: 0.2, y: 0.2, r: 0.5, color: "#ffb3c6" }, { x: 0.85, y: 0.8, r: 0.55, color: "#5f3dc4" }] },
  { id: "dusk", from: "#4f46e5", to: "#c026d3", angle: 120, blobs: [{ x: 0.75, y: 0.25, r: 0.5, color: "#a78bfa" }, { x: 0.2, y: 0.85, r: 0.45, color: "#312e81" }] },
  { id: "abyss", from: "#0b1d51", to: "#1e6fd9", angle: 160, blobs: [{ x: 0.3, y: 0.7, r: 0.5, color: "#0ea5e9" }, { x: 0.8, y: 0.15, r: 0.4, color: "#020617" }] },
  { id: "lagoon", from: "#10b981", to: "#3b82f6", angle: 135, blobs: [{ x: 0.2, y: 0.3, r: 0.45, color: "#6ee7b7" }, { x: 0.8, y: 0.75, r: 0.5, color: "#0e7490" }] },
  { id: "sunset", from: "#ff7e5f", to: "#feb47b", angle: 120, blobs: [{ x: 0.8, y: 0.2, r: 0.5, color: "#ff4e7a" }, { x: 0.2, y: 0.9, r: 0.45, color: "#ffd194" }] },
  { id: "aurora", from: "#7c3aed", to: "#06b6d4", angle: 145, blobs: [{ x: 0.3, y: 0.25, r: 0.45, color: "#f0abfc" }, { x: 0.7, y: 0.7, r: 0.5, color: "#2563eb" }] },
  { id: "mist", from: "#e0e7ff", to: "#fce7f3", angle: 135, blobs: [{ x: 0.25, y: 0.75, r: 0.5, color: "#dbeafe" }, { x: 0.8, y: 0.2, r: 0.45, color: "#fbcfe8" }] },
  { id: "pearl", from: "#d6d3d1", to: "#bae6fd", angle: 135, blobs: [{ x: 0.7, y: 0.3, r: 0.5, color: "#fed7aa" }, { x: 0.2, y: 0.8, r: 0.45, color: "#e7e5e4" }] },
  { id: "sky", from: "#38bdf8", to: "#818cf8", angle: 135, blobs: [{ x: 0.25, y: 0.25, r: 0.45, color: "#bae6fd" }, { x: 0.8, y: 0.8, r: 0.5, color: "#6366f1" }] },
  { id: "midnight", from: "#0f0c29", to: "#302b63", angle: 135, blobs: [{ x: 0.75, y: 0.75, r: 0.55, color: "#6d28d9" }, { x: 0.15, y: 0.2, r: 0.4, color: "#050412" }] },
  { id: "dawn", from: "#1e3a8a", to: "#fdba74", angle: 180, blobs: [{ x: 0.5, y: 0.95, r: 0.5, color: "#fb923c" }, { x: 0.5, y: 0.1, r: 0.45, color: "#1e40af" }] },
  { id: "lavender", from: "#a5b4fc", to: "#f5d0fe", angle: 120, blobs: [{ x: 0.3, y: 0.7, r: 0.5, color: "#c4b5fd" }, { x: 0.8, y: 0.2, r: 0.4, color: "#e0e7ff" }] },
  { id: "orchid", from: "#8b5cf6", to: "#ec4899", angle: 135, blobs: [{ x: 0.6, y: 0.45, r: 0.45, color: "#f9a8d4" }, { x: 0.15, y: 0.85, r: 0.45, color: "#6d28d9" }] },
  { id: "ember", from: "#7f1d1d", to: "#f97316", angle: 135, blobs: [{ x: 0.75, y: 0.3, r: 0.45, color: "#ef4444" }, { x: 0.25, y: 0.8, r: 0.45, color: "#450a0a" }] },
  { id: "flame", from: "#f43f5e", to: "#facc15", angle: 135, blobs: [{ x: 0.3, y: 0.3, r: 0.45, color: "#fb7185" }, { x: 0.8, y: 0.75, r: 0.5, color: "#f97316" }] },
];

const cache = new Map<string, HTMLCanvasElement>();

function draw(preset: GradientPreset, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  const rad = (preset.angle * Math.PI) / 180;
  const cx = width / 2;
  const cy = height / 2;
  const half = (Math.abs(Math.cos(rad)) * width + Math.abs(Math.sin(rad)) * height) / 2;
  const base = ctx.createLinearGradient(
    cx - Math.cos(rad) * half,
    cy - Math.sin(rad) * half,
    cx + Math.cos(rad) * half,
    cy + Math.sin(rad) * half,
  );
  base.addColorStop(0, preset.from);
  base.addColorStop(1, preset.to);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, width, height);

  const longSide = Math.max(width, height);
  for (const blob of preset.blobs) {
    const x = blob.x * width;
    const y = blob.y * height;
    const r = blob.r * longSide;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, r);
    glow.addColorStop(0, blob.color);
    glow.addColorStop(1, `${blob.color}00`);
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
  }
  return canvas;
}

/** The gradient as a canvas, at an aspect ratio matching the frame so the
 * blobs aren't squashed when it's stretched. Cached per shape of frame. */
export function gradientCanvas(id: string, aspect: number): HTMLCanvasElement | null {
  const preset = GRADIENTS.find((g) => g.id === id);
  if (!preset) return null;
  // Rounded so dragging the padding slider doesn't redraw on every pixel.
  const ratio = Math.round(aspect * 20) / 20;
  const key = `${id}:${ratio}`;
  let canvas = cache.get(key);
  if (!canvas) {
    const width = 960;
    canvas = draw(preset, width, Math.max(1, Math.round(width / ratio)));
    cache.set(key, canvas);
  }
  return canvas;
}

const swatches = new Map<string, string>();

/** A small square rendering for the panel's swatch grid. */
export function gradientSwatch(id: string): string {
  let url = swatches.get(id);
  if (!url) {
    const preset = GRADIENTS.find((g) => g.id === id);
    if (!preset) return "";
    url = draw(preset, 96, 96).toDataURL();
    swatches.set(id, url);
  }
  return url;
}
