import { Shape } from "../annotate/types";

/**
 * A frame puts the screenshot on a background, with padding around it,
 * rounded corners and a drop shadow ~ the "ready to post" look.
 *
 * It belongs to the document, next to the shapes, and is saved with them,
 * so reopening a capture from history brings its frame back.
 */
export type FrameBackground =
  | { kind: "gradient"; id: string }
  /** `color` may be "transparent", for a PNG with only the shadow around it. */
  | { kind: "color"; color: string }
  /** The screenshot itself, scaled up and heavily blurred. */
  | { kind: "blurred" }
  /** The current Windows desktop wallpaper, read again whenever it's shown. */
  | { kind: "wallpaper" }
  /** An image the user picked, by path, read again whenever it's shown. */
  | { kind: "image"; path: string };

export interface Frame {
  background: FrameBackground;
  /** 0 to 100, see `frameMetrics`. */
  padding: number;
  corners: number;
  shadow: number;
}

export const DEFAULT_SLIDERS = { padding: 40, corners: 35, shadow: 45 };

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FrameMetrics {
  /** Everything that gets exported, in image coordinates. */
  bounds: Box;
  padding: number;
  radius: number;
  shadowBlur: number;
  shadowOffsetY: number;
}

/**
 * Turns the 0 to 100 sliders into pixels, relative to the screenshot's own
 * size. A fixed pixel padding would be a thick border on a small capture and
 * a hairline on a 4K one, so every value scales with the longer side.
 */
export function frameMetrics(frame: Frame, width: number, height: number): FrameMetrics {
  const longSide = Math.max(width, height);
  const padding = Math.round((frame.padding / 100) * 0.16 * longSide);
  const radius = Math.min((frame.corners / 100) * 0.035 * longSide, Math.min(width, height) / 2);
  const shadowBlur = (frame.shadow / 100) * 0.05 * longSide;
  return {
    bounds: { x: -padding, y: -padding, width: width + padding * 2, height: height + padding * 2 },
    padding,
    radius,
    shadowBlur,
    shadowOffsetY: shadowBlur * 0.35,
  };
}

/** What a capture's history entry stores: shapes and, if any, a frame. */
export interface SavedDocument {
  shapes: Shape[];
  frame: Frame | null;
}

/**
 * Serialised as an object from this version on. Older entries stored a bare
 * array of shapes, which `parseDocument` still reads, so nothing saved
 * before frames existed is lost.
 */
export function serializeDocument(shapes: Shape[], frame: Frame | null): string {
  return JSON.stringify({ version: 2, shapes, frame });
}

export function parseDocument(json: string | null): SavedDocument | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed)) return { shapes: parsed as Shape[], frame: null };
    if (parsed && Array.isArray(parsed.shapes)) {
      return { shapes: parsed.shapes as Shape[], frame: (parsed.frame as Frame | null) ?? null };
    }
  } catch {
    // Fall through: a corrupt entry opens as a plain capture.
  }
  return null;
}

const LAST_SLIDERS_KEY = "shota.frameSliders";

/** The last padding/corners/shadow used, so picking a background on the
 * next capture starts where the last one left off. A per-machine
 * convenience, so browser storage is enough; it can always be empty. */
export function lastSliders(): typeof DEFAULT_SLIDERS {
  try {
    const raw = localStorage.getItem(LAST_SLIDERS_KEY);
    if (raw) return { ...DEFAULT_SLIDERS, ...JSON.parse(raw) };
  } catch {
    // Storage unavailable or corrupt: fall back to the defaults.
  }
  return DEFAULT_SLIDERS;
}

export function rememberSliders(frame: Frame) {
  try {
    localStorage.setItem(
      LAST_SLIDERS_KEY,
      JSON.stringify({ padding: frame.padding, corners: frame.corners, shadow: frame.shadow }),
    );
  } catch {
    // Not worth surfacing.
  }
}
