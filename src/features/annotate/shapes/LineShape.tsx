import { Line } from "react-konva";
import { LineShape as LineShapeData } from "../types";
import { ShapeComponentProps } from "./ShapeRenderer";

export function LineShapeView({ shape, ...common }: ShapeComponentProps<LineShapeData>) {
  return (
    <Line
      {...common}
      x={shape.x}
      y={shape.y}
      points={shape.points}
      rotation={shape.rotation}
      stroke={shape.style.stroke}
      strokeWidth={shape.style.strokeWidth}
      lineCap="round"
      hitStrokeWidth={Math.max(shape.style.strokeWidth, 16)}
    />
  );
}
