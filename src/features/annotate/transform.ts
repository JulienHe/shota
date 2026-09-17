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
    case "ellipse":
      return { ...base, radiusX: Math.max(4, shape.radiusX * scaleX), radiusY: Math.max(4, shape.radiusY * scaleY) };
    case "text":
      return { ...base, width: Math.max(20, shape.width * scaleX) };
    case "line":
    case "arrow":
    case "freehand":
      return {
        ...base,
        points: shape.points.map((p, i) => (i % 2 === 0 ? p * scaleX : p * scaleY)),
      };
    default:
      return base;
  }
}
