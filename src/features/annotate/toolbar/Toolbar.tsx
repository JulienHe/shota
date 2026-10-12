import { ArrowUpRight, Circle, Crop, Droplet, Highlighter, Minus, MousePointer2, Pencil, Pipette, Square, Type, Wallpaper } from "lucide-react";
import { IconButton } from "../../../components/IconButton";
import { CircleOne } from "./StepToolIcon";
import { SpotlightRect } from "./SpotlightToolIcon";
import { useToolStore } from "../../../stores/toolStore";
import { useUiStore } from "../../../stores/uiStore";
import { useDocumentStore } from "../../../stores/documentStore";
import { ShapeOptionsPanel } from "./ShapeOptionsPanel";
import { ToolId } from "../types";
import { EditorActionId, useEditorBindings, useEditorShortcuts } from "../../../lib/editorShortcuts";
import { formatAcceleratorLabel } from "../../../lib/acceleratorLabel";
import "./Toolbar.css";
import { t } from "../../../lib/i18n";

// `name` is a translation key rather than a label: the tooltip has to follow
// the UI language. The key that selects each tool is the user's binding for
// `tool.<id>` (see editorShortcuts.ts), and the tooltip reads the same
// binding, so what it advertises is always what actually works.
const TOOLS: { id: ToolId; icon: typeof MousePointer2; name: string }[] = [
  { id: "select", icon: MousePointer2, name: "tools.select" },
  { id: "rectangle", icon: Square, name: "tools.rectangle" },
  { id: "ellipse", icon: Circle, name: "tools.ellipse" },
  { id: "line", icon: Minus, name: "tools.line" },
  { id: "arrow", icon: ArrowUpRight, name: "tools.arrow" },
  { id: "text", icon: Type, name: "tools.text" },
  { id: "pen", icon: Pencil, name: "tools.pen" },
  { id: "step", icon: CircleOne, name: "tools.step" },
  { id: "highlight", icon: Highlighter, name: "tools.highlight" },
  { id: "spotlight", icon: SpotlightRect, name: "tools.spotlight" },
  { id: "blur", icon: Droplet, name: "tools.blur" },
  { id: "crop", icon: Crop, name: "tools.crop" },
  { id: "eyedropper", icon: Pipette, name: "tools.eyedropper" },
];

const actionFor = (tool: ToolId) => `tool.${tool}` as EditorActionId;

export function Toolbar() {
  const activeTool = useToolStore((s) => s.activeTool);
  const setActiveTool = useToolStore((s) => s.setActiveTool);

  const bindings = useEditorBindings();
  const backgroundPanelOpen = useUiStore((s) => s.backgroundPanelOpen);
  const toggleBackgroundPanel = useUiStore((s) => s.toggleBackgroundPanel);
  const hasFrame = useDocumentStore((s) => s.frame !== null);

  useEditorShortcuts(
    Object.fromEntries(TOOLS.map((tool) => [actionFor(tool.id), () => setActiveTool(tool.id)])),
  );

  return (
    <div className="toolbar">
      <div className="toolbar__row">
        {TOOLS.map((tool) => (
          <IconButton
            key={tool.id}
            icon={tool.icon}
            label={`${t(tool.name)} (${formatAcceleratorLabel(bindings[actionFor(tool.id)])})`}
            active={activeTool === tool.id}
            onClick={() => setActiveTool(tool.id)}
          />
        ))}

        {/* Not a drawing tool, so it sits after them and lights up as a
            toggle rather than as the active tool: the tool you're drawing
            with stays the one that's highlighted blue. It stays lit while a
            frame is on, even with the panel closed, so a framed export is
            never a surprise. */}
        <div className="toolbar__divider" />
        <IconButton
          icon={Wallpaper}
          label={t("background.title")}
          toggled={backgroundPanelOpen || hasFrame}
          onClick={toggleBackgroundPanel}
        />

        <ShapeOptionsPanel />
      </div>
    </div>
  );
}
