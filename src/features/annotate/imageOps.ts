import { Shape } from "./types";

/**
 * The edits made to the captured picture itself, as opposed to the shapes
 * drawn on it. They are kept as a list, in the order they were made, because
 * the saved capture on disk is always the *original*: reopening it replays
 * the list to get back to what was on screen. (Crop used to replace the
 * picture and forget how, so a cropped capture reopened from history showed
 * the uncropped picture with its shapes shifted off it.)
 */
export type ImageOp =
  | { op: "crop"; x: number; y: number; width: number; height: number }
  /** Quarter turns, clockwise. */
  | { op: "rotate"; turns: 1 | 2 | 3 }
  /** "x" mirrors left to right, "y" mirrors top to bottom. */
  | { op: "flip"; axis: "x" | "y" };

export interface Dimensions {
  width: number;
  height: number;
}

/** The size of the picture after `op`. */
export function dimensionsAfter(op: ImageOp, before: Dimensions): Dimensions {
  switch (op.op) {
    case "crop":
      return { width: Math.round(op.width), height: Math.round(op.height) };
    case "rotate":
      return op.turns === 2 ? before : { width: before.height, height: before.width };
    case "flip":
      return before;
  }
}

/** Draws `source` through every op in turn onto a new canvas. */
export function renderOps(source: CanvasImageSource & Dimensions, ops: ImageOp[]): HTMLCanvasElement {
  let current: CanvasImageSource & Dimensions = source;
  let size: Dimensions = { width: source.width, height: source.height };
  if (ops.length === 0) {
    const copy = document.createElement("canvas");
    copy.width = size.width;
    copy.height = size.height;
    copy.getContext("2d")?.drawImage(source, 0, 0);
    return copy;
  }
  for (const op of ops) {
    const next = dimensionsAfter(op, size);
    const canvas = document.createElement("canvas");
    canvas.width = next.width;
    canvas.height = next.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("no 2d canvas");

    switch (op.op) {
      case "crop":
        context.drawImage(current, op.x, op.y, op.width, op.height, 0, 0, canvas.width, canvas.height);
        break;
      case "rotate":
        context.translate(canvas.width / 2, canvas.height / 2);
        context.rotate((op.turns * Math.PI) / 2);
        context.drawImage(current, -size.width / 2, -size.height / 2);
        break;
      case "flip":
        if (op.axis === "x") {
          context.translate(canvas.width, 0);
          context.scale(-1, 1);
        } else {
          context.translate(0, canvas.height);
          context.scale(1, -1);
        }
        context.drawImage(current, 0, 0);
        break;
    }
    current = canvas;
    size = next;
  }
  return current as HTMLCanvasElement;
}

/* ------------------------------------------------------------------ *
 * Moving the shapes with the picture
 *
 * A shape sits at (x, y) and is turned by `rotation` about that point, with
 * its own geometry (points, width, height) measured in that turned frame.
 * Moving the picture moves the point and changes how the frame is turned;
 * the geometry inside it stays as it is. That holds for every shape, so the
 * rules below are about the point and the angle only, with two exceptions:
 *
 *  - blur and spotlight can't be turned (they sample the picture in
 *    axis-aligned space), so they are given a new axis-aligned box instead.
 *  - a mirror reverses the geometry's own direction, so points are negated
 *    along the mirrored axis and boxes are re-anchored at their far corner.
 * ------------------------------------------------------------------ */

const NON_ROTATABLE = new Set<Shape["type"]>(["blur", "spotlight"]);

function normaliseAngle(degrees: number): number {
  const wrapped = degrees % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

/** Moves `shapes` as the picture goes through `op`. `before` is the picture's size before it. */
export function transformShapes(shapes: Shape[], op: ImageOp, before: Dimensions): Shape[] {
  switch (op.op) {
    case "crop":
      return shapes.map((shape) => ({ ...shape, x: shape.x - op.x, y: shape.y - op.y }));
    case "rotate": {
      let current = shapes;
      let size = before;
      for (let i = 0; i < op.turns; i++) {
        current = current.map((shape) => quarterTurn(shape, size));
        size = { width: size.height, height: size.width };
      }
      return current;
    }
    case "flip":
      return shapes.map((shape) => mirror(shape, op.axis, before));
  }
}

/** One clockwise quarter turn of a picture of size `before`. */
function quarterTurn(shape: Shape, before: Dimensions): Shape {
  if (NON_ROTATABLE.has(shape.type)) {
    const box = shape as Shape & { width: number; height: number };
    return {
      ...box,
      x: before.height - (box.y + box.height),
      y: box.x,
      width: box.height,
      height: box.width,
    } as Shape;
  }
  return {
    ...shape,
    x: before.height - shape.y,
    y: shape.x,
    rotation: normaliseAngle(shape.rotation + 90),
  };
}

function mirror(shape: Shape, axis: "x" | "y", before: Dimensions): Shape {
  const mirroredPoint =
    axis === "x" ? { x: before.width - shape.x, y: shape.y } : { x: shape.x, y: before.height - shape.y };

  if (NON_ROTATABLE.has(shape.type)) {
    const box = shape as Shape & { width: number; height: number };
    return (
      axis === "x"
        ? { ...box, x: before.width - (box.x + box.width) }
        : { ...box, y: before.height - (box.y + box.height) }
    ) as Shape;
  }

  const rotation = normaliseAngle(-shape.rotation);
  let next: Shape = { ...shape, x: mirroredPoint.x, y: mirroredPoint.y, rotation };

  // Geometry given as points runs the other way along the mirrored axis.
  if ("points" in next && Array.isArray(next.points)) {
    const points = next.points.map((value, index) => ((index % 2 === 0) === (axis === "x") ? -value : value));
    next = { ...next, points } as Shape;
  }

  // A box is anchored at its top-left, which after a mirror is its far corner:
  // slide the anchor back along the box's own (turned) axis by its extent.
  const extent = boxExtent(shape, axis);
  if (extent > 0) {
    const angle = (rotation * Math.PI) / 180;
    const along = axis === "x" ? { x: Math.cos(angle), y: Math.sin(angle) } : { x: -Math.sin(angle), y: Math.cos(angle) };
    next = { ...next, x: next.x - along.x * extent, y: next.y - along.y * extent };
  }
  return next;
}

/** How far a shape reaches from its anchor along `axis`, for shapes anchored at a corner. */
function boxExtent(shape: Shape, axis: "x" | "y"): number {
  if (shape.type === "rectangle") return axis === "x" ? shape.width : shape.height;
  if (shape.type === "text") {
    // Text knows its width but not its height; a line is about 1.2 em.
    if (axis === "x") return shape.width;
    const lines = Math.max(1, shape.text.split("\n").length);
    return shape.style.fontSize * 1.2 * lines;
  }
  return 0;
}
