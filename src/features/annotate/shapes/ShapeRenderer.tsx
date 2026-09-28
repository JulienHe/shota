import Konva from "konva";
import { KonvaEventObject } from "konva/lib/Node";
import { Shape } from "../types";
import { RectShapeView } from "./RectShape";
import { EllipseShapeView } from "./EllipseShape";
import { LineShapeView } from "./LineShape";
import { ArrowShapeView } from "./ArrowShape";
import { TextShapeView } from "./TextShape";
import { FreehandShapeView } from "./FreehandShape";
import { StepShapeView } from "./StepShape";
import { SpotlightShapeView } from "./SpotlightShape";
import { BlurShapeView } from "./BlurShape";

export interface ShapeCommonProps {
  draggable: boolean;
  onClick: (e: KonvaEventObject<MouseEvent>) => void;
  onTap: (e: KonvaEventObject<Event>) => void;
  onDblClick?: (e: KonvaEventObject<MouseEvent>) => void;
  onMouseEnter?: (e: KonvaEventObject<MouseEvent>) => void;
  onMouseLeave?: (e: KonvaEventObject<MouseEvent>) => void;
  onDragStart?: (e: KonvaEventObject<DragEvent>) => void;
  onDragEnd: (e: KonvaEventObject<DragEvent>) => void;
  onTransform?: (e: KonvaEventObject<Event>) => void;
  onTransformEnd: (e: KonvaEventObject<Event>) => void;
  ref?: (node: Konva.Node | null) => void;
}

export interface ShapeComponentProps<T extends Shape> extends ShapeCommonProps {
  shape: T;
}

interface ShapeRendererProps extends ShapeCommonProps {
  shape: Shape;
}

/** Dispatches a generic Shape to its concrete Konva component by discriminated type. */
export function ShapeRenderer({ shape, ...common }: ShapeRendererProps) {
  switch (shape.type) {
    case "rectangle":
      return <RectShapeView shape={shape} {...common} />;
    case "ellipse":
      return <EllipseShapeView shape={shape} {...common} />;
    case "line":
      return <LineShapeView shape={shape} {...common} />;
    case "arrow":
      return <ArrowShapeView shape={shape} {...common} />;
    case "text":
      return <TextShapeView shape={shape} {...common} />;
    case "freehand":
      return <FreehandShapeView shape={shape} {...common} />;
    case "step":
      return <StepShapeView shape={shape} {...common} />;
    case "spotlight":
      return <SpotlightShapeView shape={shape} {...common} />;
    case "blur":
      return <BlurShapeView shape={shape} {...common} />;
    default:
      return null;
  }
}
