import { Ellipse } from "react-konva";
import { EllipseShape as EllipseShapeData, fillForStyle, dashForStyle, lineCapForStyle } from "../types";
import { ShapeComponentProps } from "./ShapeRenderer";

export function EllipseShapeView({ shape, ...common }: ShapeComponentProps<EllipseShapeData>) {
  return (
    <Ellipse
      {...common}
      x={shape.x}
      y={shape.y}
      radiusX={shape.radiusX}
      radiusY={shape.radiusY}
      rotation={shape.rotation}
      stroke={shape.style.stroke}
      strokeWidth={shape.style.strokeWidth}
      dash={dashForStyle(shape.style)}
      lineCap={lineCapForStyle(shape.style)}
      fill={fillForStyle(shape.style)}
    />
  );
}
