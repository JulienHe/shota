import { Fragment, useEffect, useRef, useState } from "react";
import { ArrowUpRight, ChevronDown, Circle, Crop, Droplet, Highlighter, Minus, MousePointer2, Pencil, Pipette, Square, Type, Wallpaper } from "lucide-react";
import { IconButton } from "../../../components/IconButton";
import { Popover } from "../../../components/Popover";
import { CircleOne } from "./StepToolIcon";
import { SpotlightRect } from "./SpotlightToolIcon";
import { useToolStore } from "../../../stores/toolStore";
import { ShapeOptionsPanel } from "./ShapeOptionsPanel";
import { ImageOptionsPanel } from "./ImageOptionsPanel";
import { ToolId } from "../types";
import { EditorActionId, useEditorBindings, useEditorShortcuts } from "../../../lib/editorShortcuts";
import { formatAcceleratorLabel } from "../../../lib/acceleratorLabel";
import "./Toolbar.css";
import { t } from "../../../lib/i18n";

// `name` is a translation key rather than a label: the tooltip has to follow
// the UI language. The key that selects each tool is the user's binding for
// `tool.<id>` (see editorShortcuts.ts), and the tooltip reads the same
// binding, so what it advertises is always what actually works.
const ALL_TOOLS: Record<ToolId, { icon: typeof MousePointer2; name: string }> = {
  select: { icon: MousePointer2, name: "tools.select" },
  rectangle: { icon: Square, name: "tools.rectangle" },
  ellipse: { icon: Circle, name: "tools.ellipse" },
  line: { icon: Minus, name: "tools.line" },
  arrow: { icon: ArrowUpRight, name: "tools.arrow" },
  text: { icon: Type, name: "tools.text" },
  pen: { icon: Pencil, name: "tools.pen" },
  step: { icon: CircleOne, name: "tools.step" },
  highlight: { icon: Highlighter, name: "tools.highlight" },
  spotlight: { icon: SpotlightRect, name: "tools.spotlight" },
  blur: { icon: Droplet, name: "tools.blur" },
  crop: { icon: Crop, name: "tools.crop" },
  eyedropper: { icon: Pipette, name: "tools.eyedropper" },
  background: { icon: Wallpaper, name: "background.title" },
};

/**
 * The toolbar layout: clusters of related tools with a divider between them.
 * An array of several tools is a group that takes one button, showing the
 * member used last, with the rest behind a small arrow (the shapes: one rarely
 * switches between them mid-annotation). Every tool keeps its shortcut
 * whether or not its button is on show.
 */
const LAYOUT: (ToolId | ToolId[])[][] = [
  ["select"],
  [["rectangle", "ellipse", "line"], "arrow", "text", "step", "pen"],
  ["highlight", "spotlight", "blur"],
  ["crop", "eyedropper", "background"],
];

const actionFor = (tool: ToolId) => `tool.${tool}` as EditorActionId;

function ToolGroup({ members }: { members: ToolId[] }) {
  const activeTool = useToolStore((s) => s.activeTool);
  const setActiveTool = useToolStore((s) => s.setActiveTool);
  const bindings = useEditorBindings();
  const [last, setLast] = useState<ToolId>(members[0]);
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);

  // Picking a member by its shortcut changes what the button shows too.
  const shown = members.includes(activeTool) ? activeTool : last;
  useEffect(() => {
    if (members.includes(activeTool)) setLast(activeTool);
  }, [activeTool, members]);

  const { icon, name } = ALL_TOOLS[shown];
  return (
    <div className="toolbar__group" ref={anchorRef}>
      <IconButton
        icon={icon}
        label={`${t(name)} (${formatAcceleratorLabel(bindings[actionFor(shown)])})`}
        active={members.includes(activeTool)}
        onClick={() => setActiveTool(shown)}
      />
      <button
        type="button"
        className={`toolbar__group-caret${open ? " toolbar__group-caret--open" : ""}`}
        title={t("tools.shapes")}
        aria-label={t("tools.shapes")}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <ChevronDown size={10} strokeWidth={2.5} />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={anchorRef} align="start">
        <div className="toolbar__group-menu">
          {members.map((id) => {
            const { icon: Icon, name: label } = ALL_TOOLS[id];
            return (
              <button
                key={id}
                type="button"
                className={`dropdown__menu-item${id === activeTool ? " dropdown__menu-item--active" : ""}`}
                onClick={() => {
                  setActiveTool(id);
                  setOpen(false);
                }}
              >
                <Icon size={16} strokeWidth={2} />
                {t(label)}
                <span className="toolbar__group-key">{formatAcceleratorLabel(bindings[actionFor(id)])}</span>
              </button>
            );
          })}
        </div>
      </Popover>
    </div>
  );
}

export function Toolbar() {
  const activeTool = useToolStore((s) => s.activeTool);
  const setActiveTool = useToolStore((s) => s.setActiveTool);

  const bindings = useEditorBindings();

  useEditorShortcuts(
    Object.fromEntries((Object.keys(ALL_TOOLS) as ToolId[]).map((id) => [actionFor(id), () => setActiveTool(id)])),
  );

  return (
    <div className="toolbar">
      <div className="toolbar__row">
        {LAYOUT.map((cluster, index) => (
          <Fragment key={index}>
            {index > 0 && <div className="toolbar__divider" />}
            {cluster.map((entry) => {
              if (Array.isArray(entry)) return <ToolGroup key={entry.join("-")} members={entry} />;
              const { icon, name } = ALL_TOOLS[entry];
              return (
                <IconButton
                  key={entry}
                  icon={icon}
                  label={`${t(name)} (${formatAcceleratorLabel(bindings[actionFor(entry)])})`}
                  active={activeTool === entry}
                  onClick={() => setActiveTool(entry)}
                />
              );
            })}
          </Fragment>
        ))}

        <ShapeOptionsPanel />
        {activeTool === "crop" && <ImageOptionsPanel />}
      </div>
    </div>
  );
}
