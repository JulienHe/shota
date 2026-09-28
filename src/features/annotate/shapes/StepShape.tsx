import { Circle, Group, Text } from "react-konva";
import { StepShape as StepShapeData, contrastTextColor } from "../types";
import { ShapeComponentProps } from "./ShapeRenderer";

export function StepShapeView({ shape, ...common }: ShapeComponentProps<StepShapeData>) {
  const diameter = shape.radius * 2;

  return (
    <Group {...common} x={shape.x} y={shape.y} rotation={shape.rotation}>
      <Circle radius={shape.radius} fill={shape.style.stroke} />
      <Text
        text={String(shape.number)}
        // Konva lays text out from its top-left, so centring it on the
        // circle's origin means a box the size of the badge, offset by the
        // radius — not `align` alone, which only centres within that box.
        width={diameter}
        height={diameter}
        offsetX={shape.radius}
        offsetY={shape.radius}
        align="center"
        verticalAlign="middle"
        fontSize={shape.radius}
        fontStyle="bold"
        fontFamily={shape.style.fontFamily}
        fill={contrastTextColor(shape.style.stroke)}
        // The circle underneath handles hit-testing for the whole badge;
        // letting the glyph capture events too makes dragging from the
        // centre of the number behave differently from the edge.
        listening={false}
      />
    </Group>
  );
}
