import { Arrow } from "react-konva";
import { ArrowShape as ArrowShapeData } from "../types";
import { ShapeComponentProps } from "./ShapeRenderer";

export function ArrowShapeView({ shape, ...common }: ShapeComponentProps<ArrowShapeData>) {
  return (
    <Arrow
      {...common}
      x={shape.x}
      y={shape.y}
      points={shape.points}
      rotation={shape.rotation}
      stroke={shape.style.stroke}
      fill={shape.style.stroke}
      strokeWidth={shape.style.strokeWidth}
      pointerLength={10 + shape.style.strokeWidth * 2}
      pointerWidth={10 + shape.style.strokeWidth * 2}
      hitStrokeWidth={Math.max(shape.style.strokeWidth, 16)}
    />
  );
}
