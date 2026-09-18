import { Rect } from "react-konva";
import { RectShape as RectShapeData, fillForStyle } from "../types";
import { ShapeComponentProps } from "./ShapeRenderer";

export function RectShapeView({ shape, ...common }: ShapeComponentProps<RectShapeData>) {
  return (
    <Rect
      {...common}
      x={shape.x}
      y={shape.y}
      width={shape.width}
      height={shape.height}
      rotation={shape.rotation}
      stroke={shape.style.stroke}
      strokeWidth={shape.style.strokeWidth}
      fill={fillForStyle(shape.style)}
      cornerRadius={shape.style.cornerRadius}
    />
  );
}
