import { Line } from "react-konva";
import { HighlightShape as HighlightShapeData } from "../types";
import { ShapeComponentProps } from "./ShapeRenderer";

/**
 * A highlighter swipe: a thick freehand stroke over the text.
 *
 * Two deliberate choices make it behave like a real marker:
 *
 * Multiply blending, rather than a plain translucent stroke — multiply keeps
 * dark text underneath fully dark while tinting only the light background. A
 * straight alpha stroke washes the text out along with the page and reads as
 * a sticker laid on top of it.
 *
 * The transparency lives in the node's `opacity`, not in the stroke colour.
 * A translucent colour is composited per drawing operation, so every bend and
 * self-crossing in the stroke would stack up into darker blotches; node
 * opacity rasterises the whole stroke first and fades it once, so a swipe
 * stays even no matter how much it doubles back on itself.
 */
export function HighlightShapeView({ shape, ...common }: ShapeComponentProps<HighlightShapeData>) {
  const { highlightColor, highlightOpacity, highlightWidth } = shape.style;

  return (
    <Line
      {...common}
      x={shape.x}
      y={shape.y}
      points={shape.points}
      rotation={shape.rotation}
      stroke={highlightColor}
      strokeWidth={highlightWidth}
      opacity={highlightOpacity}
      lineCap="round"
      lineJoin="round"
      tension={0.4}
      hitStrokeWidth={Math.max(highlightWidth, 16)}
      globalCompositeOperation="multiply"
    />
  );
}
