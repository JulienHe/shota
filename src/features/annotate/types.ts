export type ToolId =
  | "select"
  | "rectangle"
  | "ellipse"
  | "line"
  | "arrow"
  | "text"
  | "pen"
  | "step"
  | "spotlight"
  | "highlight"
  | "blur"
  | "crop"
  | "eyedropper";

export type FillMode = "none" | "solid" | "translucent";
export type BlurEffect = "blur" | "pixelate";
export type StrokeStyle = "solid" | "dashed" | "dotted";

export interface ShapeStyle {
  stroke: string;
  strokeWidth: number;
  strokeStyle: StrokeStyle;
  fillMode: FillMode;
  fillColor: string;
  fillOpacity: number;
  cornerRadius: number;
  fontSize: number;
  fontFamily: string;
  textStrokeEnabled: boolean;
  textStrokeColor: string;
  blurEffect: BlurEffect;
  blurIntensity: number;
  /** Spotlight keeps its own colour/opacity/radius rather than reusing the
   * shared stroke+fill ones: it dims everything *outside* the shape, so it
   * wants a dark translucent default while every other tool wants a bright
   * opaque accent, and sharing would make the two fight over one value. */
  spotlightColor: string;
  spotlightOpacity: number;
  spotlightRadius: number;
  /** Highlighter keeps its own colour/opacity for the same reason spotlight
   * does — it wants a pale wash, not the bright opaque accent every other
   * tool defaults to. */
  highlightColor: string;
  highlightOpacity: number;
  highlightWidth: number;
}

export const DEFAULT_STYLE: ShapeStyle = {
  stroke: "#ff3b30",
  strokeWidth: 3,
  strokeStyle: "solid",
  fillMode: "none",
  fillColor: "#ff3b30",
  fillOpacity: 0.35,
  cornerRadius: 0,
  fontSize: 28,
  fontFamily: "Segoe UI",
  textStrokeEnabled: false,
  textStrokeColor: "#000000",
  blurEffect: "pixelate",
  blurIntensity: 18,
  spotlightColor: "#000000",
  spotlightOpacity: 0.65,
  spotlightRadius: 12,
  highlightColor: "#fff32b",
  highlightOpacity: 0.45,
  highlightWidth: 22,
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

/** An auto-numbered circular badge, for calling out steps in a sequence. */
export interface StepShape extends BaseShape {
  type: "step";
  number: number;
  radius: number;
}

/**
 * Dims the whole image *except* this rectangle, so the selected region reads
 * as spotlit. The x/y/width/height describe the clear cut-out, not the
 * overlay — the overlay always spans the full image.
 */
export interface SpotlightShape extends BaseShape {
  type: "spotlight";
  width: number;
  height: number;
}

/** A marker swipe over text — a freehand stroke, multiply-blended, so what's
 * underneath shows through instead of being covered. */
export interface HighlightShape extends BaseShape {
  type: "highlight";
  points: number[];
}

export interface BlurShape extends BaseShape {
  type: "blur";
  width: number;
  height: number;
}

export type Shape =
  | RectShape
  | EllipseShape
  | LineShape
  | ArrowShape
  | TextShape
  | FreehandShape
  | StepShape
  | SpotlightShape
  | HighlightShape
  | BlurShape;

/* ------------------------------------------------------------------ *
 * Shape families
 *
 * Several behaviours apply to a *group* of shape types rather than one:
 * how a drag sizes them, whether a backwards drag needs normalising,
 * whether the Transformer offers a rotate handle. That membership used to
 * be re-listed inline at every site that cared — six or seven of them — so
 * adding a tool meant remembering all of them, and forgetting one failed
 * silently. The spotlight tool shipped exactly that way: it was in five of
 * the lists and missing from the two that size a drag, which is why its
 * first drag did nothing. These predicates are the single list.
 * ------------------------------------------------------------------ */

/** Sized by dragging out a width/height box from the press point. */
export type RectLikeShape = RectShape | BlurShape | SpotlightShape;
/** Built from a running list of points as the pointer moves. */
export type StrokeLikeShape = FreehandShape | HighlightShape;
/** Two-point shapes, drawn from origin to cursor. */
export type SegmentShape = LineShape | ArrowShape;

const RECT_LIKE_TYPES = new Set<Shape["type"]>(["rectangle", "blur", "spotlight"]);
const STROKE_LIKE_TYPES = new Set<Shape["type"]>(["freehand", "highlight"]);
const SEGMENT_TYPES = new Set<Shape["type"]>(["line", "arrow"]);
// Both sample or cut out the image underneath in axis-aligned image space,
// so a rotated one would have to resample along a rotated grid — not
// supported, so the handle is hidden rather than offering a broken result.
const NON_ROTATABLE_TYPES = new Set<Shape["type"]>(["blur", "spotlight"]);

export function isRectLike(shape: Shape): shape is RectLikeShape {
  return RECT_LIKE_TYPES.has(shape.type);
}

export function isStrokeLike(shape: Shape): shape is StrokeLikeShape {
  return STROKE_LIKE_TYPES.has(shape.type);
}

export function isSegment(shape: Shape): shape is SegmentShape {
  return SEGMENT_TYPES.has(shape.type);
}

/** Whether the Transformer should offer a rotate handle. Tolerates null so
 * callers can pass a possibly-absent selection straight through. */
export function supportsRotation(shape: Shape | null | undefined): boolean {
  return !shape || !NON_ROTATABLE_TYPES.has(shape.type);
}

/** Badge radius for a given number size, so the existing font-size control
 * scales the whole badge rather than overflowing the circle. */
export function radiusForFontSize(fontSize: number): number {
  return Math.round(fontSize * 0.95);
}

/**
 * Black or white, whichever stays legible as the number drawn on top of a
 * badge of the given fill. Avoids a separate "badge text colour" control
 * that the user would otherwise have to keep in sync with the fill by hand
 * (and get wrong on a yellow badge).
 */
export function contrastTextColor(hex: string): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  // Rec. 601 luma — plenty for choosing ink on a flat swatch.
  const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luma > 0.6 ? "#1c1d22" : "#ffffff";
}

/** The spotlight's dimming colour, with its opacity baked into the string
 * (Konva takes no separate fill-opacity — see {@link fillForStyle}). */
export function spotlightFill(style: ShapeStyle): string {
  return hexToRgba(style.spotlightColor, style.spotlightOpacity);
}

/** The highlighter's ink, with opacity baked in (see {@link fillForStyle}). */
export function highlightFill(style: ShapeStyle): string {
  return hexToRgba(style.highlightColor, style.highlightOpacity);
}

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

/**
 * Konva dash arrays, in pixels, scaled to the stroke width so thick strokes
 * don't end up with dashes/dots that look proportionally tiny. `undefined`
 * (solid) omits the `dash` prop entirely rather than passing `[]`, since an
 * empty array still triggers Konva's dash code path.
 */
export function dashForStyle(style: ShapeStyle): number[] | undefined {
  if (style.strokeStyle === "dashed") return [style.strokeWidth * 2.5, style.strokeWidth * 1.75];
  if (style.strokeStyle === "dotted") return [0.001, style.strokeWidth * 2.2];
  return undefined;
}

/** Dots only render as dots (not short dashes) with a round line cap. */
export function lineCapForStyle(style: ShapeStyle): "round" | "butt" {
  return style.strokeStyle === "dotted" ? "round" : "butt";
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
