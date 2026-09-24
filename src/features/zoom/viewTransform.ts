import { ZoomState } from "./useZoom";

export interface Point {
  x: number;
  y: number;
}

/**
 * Converts a point in image-space (the coordinate system the screenshot and
 * every shape live in) to absolute stage-space (pixels within the Konva
 * Stage's own container, accounting for the current pan/zoom) — and back.
 * Re-derived independently in a few places before this existed (the crop
 * tool's drag/resize clamping, the cursor→image-point conversion, the text
 * editor's overlay positioning); this is the one place that math lives now.
 */
export function imageToAbsolute(view: ZoomState, point: Point): Point {
  return { x: point.x * view.scale + view.x, y: point.y * view.scale + view.y };
}

export function absoluteToImage(view: ZoomState, point: Point): Point {
  return { x: (point.x - view.x) / view.scale, y: (point.y - view.y) / view.scale };
}

/** Scalar counterparts for lengths (widths, radii, min-size clamps) rather than positions. */
export function imageLengthToAbsolute(view: ZoomState, length: number): number {
  return length * view.scale;
}

export function absoluteLengthToImage(view: ZoomState, length: number): number {
  return length / view.scale;
}
