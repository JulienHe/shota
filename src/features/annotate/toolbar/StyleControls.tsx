import { useState } from "react";
import { Minus, Square, RectangleHorizontal, Plus } from "lucide-react";
import { Popover } from "../../../components/Popover";
import { useToolStore } from "../../../stores/toolStore";
import { FillMode, ToolId } from "../types";
import "./StyleControls.css";

const STROKE_PRESETS = [2, 4, 8];
const SHAPE_TOOLS: ToolId[] = ["rectangle", "ellipse", "line", "arrow", "pen"];
const FILLABLE_TOOLS: ToolId[] = ["rectangle", "ellipse"];

interface StyleControlsProps {
  activeTool: ToolId;
}

/** Compact, icon-only style controls that appear inline in the toolbar for the active drawing tool. */
export function StyleControls({ activeTool }: StyleControlsProps) {
  const style = useToolStore((s) => s.style);
  const updateStyle = useToolStore((s) => s.updateStyle);
  const [colorOpen, setColorOpen] = useState(false);
  const [widthOpen, setWidthOpen] = useState(false);

  if (!SHAPE_TOOLS.includes(activeTool) && activeTool !== "text") return null;

  const showFill = FILLABLE_TOOLS.includes(activeTool);
  const showCornerRadius = activeTool === "rectangle";
  const showFontSize = activeTool === "text";
  const showStroke = SHAPE_TOOLS.includes(activeTool);

  return (
    <div className="style-controls">
      <div className="style-controls__anchor">
        <button
          type="button"
          className="style-controls__color-dot"
          style={{ background: style.stroke }}
          title="Color"
          onClick={() => setColorOpen((o) => !o)}
        />
        <Popover open={colorOpen} onClose={() => setColorOpen(false)}>
          <div className="style-controls__palette">
            {["#ff3b30", "#ff9500", "#ffcc00", "#34c759", "#3d7bfd", "#af52de", "#111111", "#ffffff"].map((c) => (
              <button
                key={c}
                type="button"
                className={`style-controls__swatch${style.stroke === c ? " style-controls__swatch--active" : ""}`}
                style={{ background: c }}
                onClick={() => updateStyle({ stroke: c, fillColor: c })}
              />
            ))}
            <input
              type="color"
              className="style-controls__custom"
              value={style.stroke}
              onChange={(e) => updateStyle({ stroke: e.target.value, fillColor: e.target.value })}
            />
          </div>
        </Popover>
      </div>

      {showStroke && (
        <div className="style-controls__anchor">
          <button type="button" className="icon-button" title="Stroke width" onClick={() => setWidthOpen((o) => !o)}>
            <span className="style-controls__width-dot" style={{ width: style.strokeWidth + 4, height: style.strokeWidth + 4 }} />
          </button>
          <Popover open={widthOpen} onClose={() => setWidthOpen(false)}>
            <div className="style-controls__widths">
              {STROKE_PRESETS.map((w) => (
                <button
                  key={w}
                  type="button"
                  className={`style-controls__width-option${style.strokeWidth === w ? " style-controls__width-option--active" : ""}`}
                  title={`${w}px`}
                  onClick={() => updateStyle({ strokeWidth: w })}
                >
                  <span style={{ width: w + 6, height: w + 6 }} />
                </button>
              ))}
            </div>
          </Popover>
        </div>
      )}

      {showFill && (
        <div className="style-controls__fill-group">
          <FillModeButton mode="none" active={style.fillMode === "none"} onClick={() => updateStyle({ fillMode: "none" })} />
          <FillModeButton mode="translucent" active={style.fillMode === "translucent"} onClick={() => updateStyle({ fillMode: "translucent" })} />
          <FillModeButton mode="solid" active={style.fillMode === "solid"} onClick={() => updateStyle({ fillMode: "solid" })} />
        </div>
      )}

      {showCornerRadius && (
        <button
          type="button"
          className={`icon-button${style.cornerRadius > 0 ? " icon-button--active" : ""}`}
          title="Rounded corners"
          onClick={() => updateStyle({ cornerRadius: style.cornerRadius > 0 ? 0 : 12 })}
        >
          {style.cornerRadius > 0 ? <Square size={16} strokeWidth={2} /> : <RectangleHorizontal size={16} strokeWidth={2} />}
        </button>
      )}

      {showFontSize && (
        <div className="style-controls__stepper">
          <button type="button" title="Smaller" onClick={() => updateStyle({ fontSize: Math.max(12, style.fontSize - 4) })}>
            <Minus size={13} />
          </button>
          <span>{style.fontSize}</span>
          <button type="button" title="Larger" onClick={() => updateStyle({ fontSize: Math.min(96, style.fontSize + 4) })}>
            <Plus size={13} />
          </button>
        </div>
      )}
    </div>
  );
}

function FillModeButton({ mode, active, onClick }: { mode: FillMode; active: boolean; onClick: () => void }) {
  const titles: Record<FillMode, string> = { none: "Stroke only", translucent: "Stroke + fill", solid: "Filled" };
  return (
    <button
      type="button"
      className={`style-controls__fill-swatch style-controls__fill-swatch--${mode}${active ? " style-controls__fill-swatch--active" : ""}`}
      title={titles[mode]}
      onClick={onClick}
    />
  );
}
