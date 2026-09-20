import Konva from "konva";
import { Shape } from "./types";

/**
 * Converts a Konva Transformer's scale/rotation delta on a node back into
 * shape-space attributes, then resets the node's scale to 1 so future drags
 * and transforms start from a clean baseline.
 */
export function getTransformPatch(shape: Shape, node: Konva.Node): Partial<Shape> {
  const scaleX = node.scaleX();
  const scaleY = node.scaleY();
  const rotation = node.rotation();
  const x = node.x();
  const y = node.y();

  node.scaleX(1);
  node.scaleY(1);

  const base = { x, y, rotation };

  switch (shape.type) {
    case "rectangle":
      return { ...base, width: Math.max(4, shape.width * scaleX), height: Math.max(4, shape.height * scaleY) };
    case "blur":
      // Same reasoning as "text" below: the live onTransform handler (see
      // BlurShape.tsx) already bakes scale into the node's own width/height
      // and resets scale to 1 on every tick, so that's the authoritative
      // current size — `shape.width * scaleX` here would multiply the stale
      // pre-resize width by an already-reset (1) scale and discard the
      // resize entirely.
      return {
        ...base,
        width: Math.max(4, (node as Konva.Image).width()),
        height: Math.max(4, (node as Konva.Image).height()),
      };
    case "ellipse":
      return { ...base, radiusX: Math.max(4, shape.radiusX * scaleX), radiusY: Math.max(4, shape.radiusY * scaleY) };
    case "text":
      // Not `shape.width * scaleX`: the live onTransform handler (see
      // Canvas.tsx) already continuously resets the node's own scale to 1
      // and bakes the size change straight into its `width` on every tick,
      // so that's the authoritative current size — by the time this runs,
      // scaleX is back to 1 and multiplying the *stale* React-state width by
      // it would just discard the resize.
      return { ...base, width: Math.max(20, (node as Konva.Text).width() * scaleX) };
    case "line":
    case "arrow": {
      const points = shape.points.map((p, i) => (i % 2 === 0 ? p * scaleX : p * scaleY));
      const [x1, y1, x2, y2] = points;
      const length = Math.hypot(x2 - x1, y2 - y1);
      // Keeps a shrunk line/arrow from collapsing to a near-point, which
      // leaves the Transformer's rotate handle with no usable bounding box
      // to position itself off of.
      const MIN_LENGTH = 12;
      if (length > 0 && length < MIN_LENGTH) {
        const grow = MIN_LENGTH / length;
        return { ...base, points: [x1, y1, x1 + (x2 - x1) * grow, y1 + (y2 - y1) * grow] };
      }
      return { ...base, points };
    }
    case "freehand":
      return {
        ...base,
        points: shape.points.map((p, i) => (i % 2 === 0 ? p * scaleX : p * scaleY)),
      };
    default:
      return base;
  }
}
