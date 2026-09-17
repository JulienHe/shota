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

export function fillForStyle(style: ShapeStyle): string | undefined {
  if (style.fillMode === "none") return undefined;
  if (style.fillMode === "solid") return style.fillColor;
  return style.fillColor;
}

export function fillOpacityForStyle(style: ShapeStyle): number {
  if (style.fillMode === "translucent") return style.fillOpacity;
  if (style.fillMode === "solid") return 1;
  return 0;
}
