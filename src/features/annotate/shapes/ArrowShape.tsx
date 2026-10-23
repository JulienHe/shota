import { Arrow } from "react-konva";
import { ArrowShape as ArrowShapeData, dashForStyle, lineCapForStyle } from "../types";
import { ShapeComponentProps } from "./ShapeRenderer";

export function ArrowShapeView({ shape, ...common }: ShapeComponentProps<ArrowShapeData>) {
  // Arrows saved before heads could be chosen have no `arrowHead`.
  const head = shape.style.arrowHead ?? "filled";
  return (
    <Arrow
      {...common}
      x={shape.x}
      y={shape.y}
      points={shape.points}
      rotation={shape.rotation}
      stroke={shape.style.stroke}
      // Konva fills the head with `fill`; a clear one leaves just its outline.
      fill={head === "outline" ? "rgba(0, 0, 0, 0)" : shape.style.stroke}
      pointerAtBeginning={head === "double"}
      strokeWidth={shape.style.strokeWidth}
      dash={dashForStyle(shape.style)}
      lineCap={lineCapForStyle(shape.style)}
      strokeScaleEnabled={false}
      pointerLength={10 + shape.style.strokeWidth * 2}
      pointerWidth={10 + shape.style.strokeWidth * 2}
      hitStrokeWidth={Math.max(shape.style.strokeWidth, 16)}
    />
  );
}
