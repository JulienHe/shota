import { Text } from "react-konva";
import { TextShape as TextShapeData } from "../types";
import { cssFontFamily } from "../fonts";
import { ShapeComponentProps } from "./ShapeRenderer";

export function TextShapeView({ shape, ...common }: ShapeComponentProps<TextShapeData>) {
  const { textStrokeEnabled, textStrokeColor, fontSize } = shape.style;
  return (
    <Text
      {...common}
      x={shape.x}
      y={shape.y}
      text={shape.text}
      width={shape.width}
      rotation={shape.rotation}
      fontSize={fontSize}
      fontFamily={cssFontFamily(shape.style.fontFamily)}
      fill={shape.style.stroke}
      stroke={textStrokeEnabled ? textStrokeColor : undefined}
      strokeWidth={textStrokeEnabled ? Math.max(1, fontSize / 12) : undefined}
      fillAfterStrokeEnabled
      wrap="word"
    />
  );
}
