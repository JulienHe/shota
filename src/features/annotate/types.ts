export type ToolId =
  | "select"
  | "rectangle"
  | "ellipse"
  | "line"
  | "arrow"
  | "text"
  | "pen"
  | "crop"
  | "eyedropper";

export type FillMode = "none" | "solid" | "translucent";

export interface ShapeStyle {
  stroke: string;
  strokeWidth: number;
  fillMode: FillMode;
  fillColor: string;
  fillOpacity: number;
  cornerRadius: number;
  fontSize: number;
}

export const DEFAULT_STYLE: ShapeStyle = {
  stroke: "#ff3b30",
  strokeWidth: 3,
  fillMode: "none",
  fillColor: "#ff3b30",
  fillOpacity: 0.35,
  cornerRadius: 0,
  fontSize: 28,
};

interface BaseShape {
  id: string;
  x: number;
  y: number;
  rotation: number;
  style: ShapeStyle;
}

export interface RectShape extends BaseShape {
  type: "rectangle";
  width: number;
  height: number;
}

export interface EllipseShape extends BaseShape {
  type: "ellipse";
  radiusX: number;
  radiusY: number;
}

export interface LineShape extends BaseShape {
  type: "line";
  points: number[]; // relative to x/y
}

export interface ArrowShape extends BaseShape {
  type: "arrow";
  points: number[];
}

export interface TextShape extends BaseShape {
  type: "text";
  text: string;
  width: number;
}

export interface FreehandShape extends BaseShape {
  type: "freehand";
  points: number[];
}

export type Shape =
  | RectShape
  | EllipseShape
  | LineShape
  | ArrowShape
  | TextShape
  | FreehandShape;

export function createShapeId(): string {
  return `shape_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Konva has no `fillOpacity` attribute (it's an SVG concept, silently
 * ignored by Konva), so the fill's alpha has to be baked into the color
 * string itself.
 *
 * This always returns a real color — even at alpha 0 for "stroke only" mode
 * — rather than `undefined`, because Konva only hit-tests a shape's interior
 * (not just its stroke) when `fill` is set. Its hit canvas ignores the
 * actual alpha, so a fully transparent fill still keeps the whole shape
 * clickable/draggable while staying visually invisible.
 */
export function fillForStyle(style: ShapeStyle): string {
  const alpha = style.fillMode === "none" ? 0 : style.fillMode === "solid" ? 1 : style.fillOpacity;
  return hexToRgba(style.fillColor, alpha);
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
