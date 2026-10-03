import { useEffect } from "react";
import { ArrowUpRight, Circle, Crop, Droplet, Highlighter, Minus, MousePointer2, Pencil, Pipette, Square, Type } from "lucide-react";
import { IconButton } from "../../../components/IconButton";
import { CircleOne } from "./StepToolIcon";
import { SpotlightRect } from "./SpotlightToolIcon";
import { useToolStore } from "../../../stores/toolStore";
import { ShapeOptionsPanel } from "./ShapeOptionsPanel";
import { ToolId } from "../types";
import { isTypingTarget } from "../../../lib/isTypingTarget";
import "./Toolbar.css";
import { t } from "../../../lib/i18n";

/** `key` is both the shortcut and what the tooltip advertises, so the two
 * can't drift apart (the labels promised these letters long before anything
 * actually bound them). */
// `name` is a translation key rather than a label: the tooltip has to follow
// the UI language, while `key` is the physical key pressed and must not.
const TOOLS: { id: ToolId; icon: typeof MousePointer2; name: string; key: string }[] = [
  { id: "select", icon: MousePointer2, name: "tools.select", key: "v" },
  { id: "rectangle", icon: Square, name: "tools.rectangle", key: "r" },
  { id: "ellipse", icon: Circle, name: "tools.ellipse", key: "o" },
  { id: "line", icon: Minus, name: "tools.line", key: "l" },
  { id: "arrow", icon: ArrowUpRight, name: "tools.arrow", key: "a" },
  { id: "text", icon: Type, name: "tools.text", key: "t" },
  { id: "pen", icon: Pencil, name: "tools.pen", key: "p" },
  { id: "step", icon: CircleOne, name: "tools.step", key: "n" },
  { id: "highlight", icon: Highlighter, name: "tools.highlight", key: "h" },
  { id: "spotlight", icon: SpotlightRect, name: "tools.spotlight", key: "s" },
  { id: "blur", icon: Droplet, name: "tools.blur", key: "b" },
  { id: "crop", icon: Crop, name: "tools.crop", key: "c" },
  { id: "eyedropper", icon: Pipette, name: "tools.eyedropper", key: "i" },
];

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
            label={`${t(tool.name)} (${tool.key.toUpperCase()})`}
            active={activeTool === tool.id}
            onClick={() => setActiveTool(tool.id)}
          />
        ))}

        <ShapeOptionsPanel />
      </div>
    </div>
  );
}
