import { Line } from "react-konva";
import { FreehandShape as FreehandShapeData } from "../types";
import { ShapeComponentProps } from "./ShapeRenderer";

export function FreehandShapeView({ shape, ...common }: ShapeComponentProps<FreehandShapeData>) {
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
      lineJoin="round"
      tension={0.4}
      hitStrokeWidth={Math.max(shape.style.strokeWidth, 16)}
    />
  );
}
