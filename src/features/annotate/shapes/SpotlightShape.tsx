import { Shape as KonvaShape } from "react-konva";
import Konva from "konva";
import { useDocumentStore } from "../../../stores/documentStore";
import { SpotlightShape as SpotlightShapeData, spotlightFill } from "../types";
import { bakeNodeScale } from "../transform";
import { ShapeComponentProps } from "./ShapeRenderer";

/** Rounded-rect subpath, drawn by hand rather than via `roundRect` so this
 * doesn't depend on that method being present in the host WebView2. */
function roundedRectPath(ctx: CanvasRenderingContext2D, w: number, h: number, radius: number) {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  ctx.moveTo(r, 0);
  ctx.lineTo(w - r, 0);
  ctx.arcTo(w, 0, w, r, r);
  ctx.lineTo(w, h - r);
  ctx.arcTo(w, h, w - r, h, r);
  ctx.lineTo(r, h);
  ctx.arcTo(0, h, 0, h - r, r);
  ctx.lineTo(0, r);
  ctx.arcTo(0, 0, r, 0, r);
  ctx.closePath();
}

/**
 * Paints a translucent scrim over the entire image with this shape's
 * rectangle punched out of it, so the selection reads as spotlit.
 *
 * The hole is cut with an even-odd fill of two subpaths (whole image, then
 * the cut-out) in a single shape. The alternative — a full-size scrim plus a
 * `destination-out` rect — would need the pair wrapped in a cached Group to
 * stop the erase leaking onto the photo underneath, and caching a
 * full-resolution offscreen canvas on every edit is very expensive at 4K.
 */
export function SpotlightShapeView({ shape, ...common }: ShapeComponentProps<SpotlightShapeData>) {
  const imageWidth = useDocumentStore((s) => s.imageWidth);
  const imageHeight = useDocumentStore((s) => s.imageHeight);

  const fill = spotlightFill(shape.style);
  const radius = shape.style.spotlightRadius;

  return (
    <KonvaShape
      {...common}
      x={shape.x}
      y={shape.y}
      width={Math.max(1, shape.width)}
      height={Math.max(1, shape.height)}
      rotation={shape.rotation}
      // Redraw when any of these change — Konva can't see into sceneFunc.
      sceneFunc={(ctx, node) => {
        const raw = ctx._context;
        const w = Math.max(1, node.width());
        const h = Math.max(1, node.height());

        raw.beginPath();
        // Outer subpath in the node's local space: the node sits at the
        // cut-out's origin, so the image starts at negative coordinates.
        raw.rect(-node.x(), -node.y(), imageWidth, imageHeight);
        roundedRectPath(raw, w, h, radius);
        raw.fillStyle = fill;
        raw.fill("evenodd");
      }}
      // Without this the clickable region would be the whole scrim, so any
      // click anywhere on the image would grab the spotlight. Grabbing the
      // clear cut-out is what matches where the transform handles appear.
      hitFunc={(ctx, node) => {
        ctx.beginPath();
        ctx.rect(0, 0, Math.max(1, node.width()), Math.max(1, node.height()));
        ctx.closePath();
        ctx.fillStrokeShape(node);
      }}
      onTransform={(e) => {
        // Same reasoning as BlurShape: Konva resizes by applying a live
        // scale, which would stretch the scrim and its hole instead of
        // resizing the cut-out. Bake it back into width/height each tick.
        const node = e.target as Konva.Shape;
        bakeNodeScale(node, 8);
        node.getLayer()?.batchDraw();
      }}
    />
  );
}
