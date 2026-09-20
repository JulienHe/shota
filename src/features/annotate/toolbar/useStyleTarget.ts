import { useToolStore } from "../../../stores/toolStore";
import { useDocumentStore } from "../../../stores/documentStore";
import { ShapeStyle } from "../types";

const STROKE_KINDS = new Set(["rectangle", "ellipse", "line", "arrow", "pen", "freehand"]);
const FILL_KINDS = new Set(["rectangle", "ellipse"]);
const CORNER_RADIUS_KINDS = new Set(["rectangle"]);
const FONT_SIZE_KINDS = new Set(["text"]);
const BLUR_KINDS = new Set(["blur"]);
const RELEVANT_KINDS = new Set([...STROKE_KINDS, ...FILL_KINDS, ...FONT_SIZE_KINDS, ...BLUR_KINDS, "text"]);

export interface StyleTarget {
  kind: string;
  style: ShapeStyle;
  updateStyle: (patch: Partial<ShapeStyle>) => void;
  showStroke: boolean;
  showFill: boolean;
  showCornerRadius: boolean;
  showFontSize: boolean;
  showBlur: boolean;
}

/**
 * Resolves which style is currently relevant to edit: the selected shape's
 * own style when one is selected, otherwise the "next shape" style on the
 * active drawing tool. Returns null when neither applies (e.g. select tool
 * with nothing selected, or crop/eyedropper active).
 */
export function useStyleTarget(): StyleTarget | null {
  const activeTool = useToolStore((s) => s.activeTool);
  const toolStyle = useToolStore((s) => s.style);
  const updateToolStyle = useToolStore((s) => s.updateStyle);

  const selectedShapeId = useDocumentStore((s) => s.selectedShapeId);
  const shapes = useDocumentStore((s) => s.shapes);
  const updateShapeStyle = useDocumentStore((s) => s.updateShapeStyle);

  const selectedShape = selectedShapeId ? shapes.find((sh) => sh.id === selectedShapeId) ?? null : null;

  let kind: string;
  let style: ShapeStyle;
  let updateStyle: (patch: Partial<ShapeStyle>) => void;

  if (selectedShape) {
    kind = selectedShape.type;
    style = selectedShape.style;
    updateStyle = (patch) => updateShapeStyle(selectedShape.id, patch);
  } else {
    kind = activeTool;
    style = toolStyle;
    updateStyle = updateToolStyle;
  }

  if (!RELEVANT_KINDS.has(kind)) return null;

  return {
    kind,
    style,
    updateStyle,
    showStroke: STROKE_KINDS.has(kind),
    showFill: FILL_KINDS.has(kind),
    showCornerRadius: CORNER_RADIUS_KINDS.has(kind),
    showFontSize: FONT_SIZE_KINDS.has(kind),
    showBlur: BLUR_KINDS.has(kind),
  };
}
