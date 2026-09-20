import { MousePointer2, Square, Circle, Minus, ArrowUpRight, Type, Pencil, Droplet, Crop, Pipette } from "lucide-react";
import { IconButton } from "../../../components/IconButton";
import { useToolStore } from "../../../stores/toolStore";
import { ShapeOptionsPanel } from "./ShapeOptionsPanel";
import { ToolId } from "../types";
import "./Toolbar.css";

const TOOLS: { id: ToolId; icon: typeof MousePointer2; label: string }[] = [
  { id: "select", icon: MousePointer2, label: "Select (V)" },
  { id: "rectangle", icon: Square, label: "Rectangle (R)" },
  { id: "ellipse", icon: Circle, label: "Ellipse (O)" },
  { id: "line", icon: Minus, label: "Line (L)" },
  { id: "arrow", icon: ArrowUpRight, label: "Arrow (A)" },
  { id: "text", icon: Type, label: "Text (T)" },
  { id: "pen", icon: Pencil, label: "Freehand pen (P)" },
  { id: "blur", icon: Droplet, label: "Blur / pixelate (B)" },
  { id: "crop", icon: Crop, label: "Crop (C)" },
  { id: "eyedropper", icon: Pipette, label: "Color picker (I)" },
];

export function Toolbar() {
  const activeTool = useToolStore((s) => s.activeTool);
  const setActiveTool = useToolStore((s) => s.setActiveTool);

  return (
    <div className="toolbar">
      <div className="toolbar__row">
        {TOOLS.map((tool) => (
          <IconButton
            key={tool.id}
            icon={tool.icon}
            label={tool.label}
            active={activeTool === tool.id}
            onClick={() => setActiveTool(tool.id)}
          />
        ))}

        <ShapeOptionsPanel />
      </div>
    </div>
  );
}
