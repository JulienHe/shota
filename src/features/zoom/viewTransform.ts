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

export interface Size {
  width: number;
  height: number;
}

/** Breathing room left around a fitted image, so it doesn't touch the
 * viewport edges. */
const FIT_PADDING = 40;

/**
 * The zoom level that fits an image inside the viewport, never magnifying
 * past 1:1 — a small screenshot should sit at its real size rather than
 * being blown up to fill the window.
 */
export function fitScale(image: Size, viewport: Size): number {
  return Math.min(
    (viewport.width - FIT_PADDING) / image.width,
    (viewport.height - FIT_PADDING) / image.height,
    1,
  );
}

/**
 * A complete view (scale + pan) that centres an image in the viewport at
 * the given scale, or at the fitted scale when none is given.
 *
 * Both halves of this used to be written out twice in Canvas — once in
 * `zoomToFit` and again in the layout effect that reacts to a new image or
 * a resize — including the padding constant, which is exactly the kind of
 * thing that drifts between two copies.
 */
export function centeredView(image: Size, viewport: Size, scale = fitScale(image, viewport)): ZoomState {
  return {
    scale,
    x: (viewport.width - image.width * scale) / 2,
    y: (viewport.height - image.height * scale) / 2,
  };
}
