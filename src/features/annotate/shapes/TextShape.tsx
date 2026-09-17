import { Text } from "react-konva";
import { TextShape as TextShapeData } from "../types";
import { ShapeComponentProps } from "./ShapeRenderer";

export function TextShapeView({ shape, ...common }: ShapeComponentProps<TextShapeData>) {
  return (
    <Text
      {...common}
      x={shape.x}
      y={shape.y}
      text={shape.text}
      width={shape.width}
      rotation={shape.rotation}
      fontSize={shape.style.fontSize}
      fontFamily="Segoe UI, sans-serif"
      fill={shape.style.stroke}
      wrap="word"
    />
  );
}
