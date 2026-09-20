import { Rect } from "react-konva";
import { RectShape as RectShapeData, fillForStyle, dashForStyle, lineCapForStyle } from "../types";
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
      dash={dashForStyle(shape.style)}
      lineCap={lineCapForStyle(shape.style)}
      fill={fillForStyle(shape.style)}
      cornerRadius={shape.style.cornerRadius}
    />
  );
}
