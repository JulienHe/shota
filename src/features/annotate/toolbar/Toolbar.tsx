import { useEffect } from "react";
import { ArrowUpRight, Circle, Crop, Droplet, Minus, MousePointer2, Pencil, Pipette, Square, Type } from "lucide-react";
import { IconButton } from "../../../components/IconButton";
import { CircleOne } from "./StepToolIcon";
import { SpotlightRect } from "./SpotlightToolIcon";
import { useToolStore } from "../../../stores/toolStore";
import { ShapeOptionsPanel } from "./ShapeOptionsPanel";
import { ToolId } from "../types";
import "./Toolbar.css";

/** `key` is both the shortcut and what the tooltip advertises, so the two
 * can't drift apart (the labels promised these letters long before anything
 * actually bound them). */
const TOOLS: { id: ToolId; icon: typeof MousePointer2; name: string; key: string }[] = [
  { id: "select", icon: MousePointer2, name: "Select", key: "v" },
  { id: "rectangle", icon: Square, name: "Rectangle", key: "r" },
  { id: "ellipse", icon: Circle, name: "Ellipse", key: "o" },
  { id: "line", icon: Minus, name: "Line", key: "l" },
  { id: "arrow", icon: ArrowUpRight, name: "Arrow", key: "a" },
  { id: "text", icon: Type, name: "Text", key: "t" },
  { id: "pen", icon: Pencil, name: "Freehand pen", key: "p" },
  { id: "step", icon: CircleOne, name: "Numbered step", key: "n" },
  { id: "spotlight", icon: SpotlightRect, name: "Spotlight", key: "s" },
  { id: "blur", icon: Droplet, name: "Blur / pixelate", key: "b" },
  { id: "crop", icon: Crop, name: "Crop", key: "c" },
  { id: "eyedropper", icon: Pipette, name: "Color picker", key: "i" },
];

/** True while the user is typing somewhere a letter key means a letter. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

export function Toolbar() {
  const activeTool = useToolStore((s) => s.activeTool);
  const setActiveTool = useToolStore((s) => s.setActiveTool);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Ctrl/Cmd combos belong to the editor's own shortcuts (copy, save,
      // undo…), and a bare letter is just a letter while the text tool's
      // editor or any settings field has focus.
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;

      const tool = TOOLS.find((t) => t.key === event.key.toLowerCase());
      if (!tool) return;
      event.preventDefault();
      setActiveTool(tool.id);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setActiveTool]);

  return (
    <div className="toolbar">
      <div className="toolbar__row">
        {TOOLS.map((tool) => (
          <IconButton
            key={tool.id}
            icon={tool.icon}
            label={`${tool.name} (${tool.key.toUpperCase()})`}
            active={activeTool === tool.id}
            onClick={() => setActiveTool(tool.id)}
          />
        ))}

        <ShapeOptionsPanel />
      </div>
    </div>
  );
}
