import {
  MousePointer2,
  Square,
  Circle,
  Minus,
  ArrowUpRight,
  Type,
  Pencil,
  Crop,
  Pipette,
  Undo2,
  Redo2,
  Copy,
  Trash2,
} from "lucide-react";
import { IconButton } from "../../../components/IconButton";
import { useToolStore } from "../../../stores/toolStore";
import { useDocumentStore } from "../../../stores/documentStore";
import { StyleControls } from "./StyleControls";
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
  { id: "crop", icon: Crop, label: "Crop (C)" },
  { id: "eyedropper", icon: Pipette, label: "Color picker (I)" },
];

interface ToolbarProps {
  onCopy: () => void;
  onSave: () => void;
}

export function Toolbar({ onCopy, onSave }: ToolbarProps) {
  const activeTool = useToolStore((s) => s.activeTool);
  const setActiveTool = useToolStore((s) => s.setActiveTool);
  const undo = useDocumentStore((s) => s.undo);
  const redo = useDocumentStore((s) => s.redo);
  const canUndo = useDocumentStore((s) => s.past.length > 0);
  const canRedo = useDocumentStore((s) => s.future.length > 0);
  const selectedShapeId = useDocumentStore((s) => s.selectedShapeId);
  const removeShape = useDocumentStore((s) => s.removeShape);

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

        <StyleControls activeTool={activeTool} />

        <div className="toolbar__divider" />

        <IconButton icon={Undo2} label="Undo" disabled={!canUndo} onClick={undo} />
        <IconButton icon={Redo2} label="Redo" disabled={!canRedo} onClick={redo} />
        <IconButton
          icon={Trash2}
          label="Delete selection"
          disabled={!selectedShapeId}
          onClick={() => selectedShapeId && removeShape(selectedShapeId)}
        />

        <div className="toolbar__divider" />

        <IconButton icon={Copy} label="Copy (Ctrl+C)" onClick={onCopy} />
        <button type="button" className="toolbar__save" onClick={onSave}>
          Save as…
        </button>
      </div>
    </div>
  );
}
