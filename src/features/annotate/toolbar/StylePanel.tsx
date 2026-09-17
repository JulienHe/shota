import { ColorSwatch } from "../../../components/ColorSwatch";
import { Slider } from "../../../components/Slider";
import { useToolStore } from "../../../stores/toolStore";
import { FillMode, ToolId } from "../types";
import "./StylePanel.css";

const FILL_MODES: { id: FillMode; label: string }[] = [
  { id: "none", label: "Stroke only" },
  { id: "solid", label: "Filled" },
  { id: "translucent", label: "Stroke + opacity fill" },
];

const SHAPE_TOOLS: ToolId[] = ["rectangle", "ellipse", "line", "arrow", "pen"];

interface StylePanelProps {
  activeTool: ToolId;
}

export function StylePanel({ activeTool }: StylePanelProps) {
  const style = useToolStore((s) => s.style);
  const updateStyle = useToolStore((s) => s.updateStyle);

  if (activeTool === "select" || activeTool === "crop" || activeTool === "eyedropper") return null;

  const showFill = activeTool === "rectangle" || activeTool === "ellipse";
  const showCornerRadius = activeTool === "rectangle";
  const showFontSize = activeTool === "text";
  const showStrokeControls = SHAPE_TOOLS.includes(activeTool);

  return (
    <div className="style-panel">
      <div className="style-panel__section">
        <span className="style-panel__label">Color</span>
        <ColorSwatch value={style.stroke} onChange={(stroke) => updateStyle({ stroke, fillColor: stroke })} />
      </div>

      {showStrokeControls && (
        <div className="style-panel__section">
          <Slider label="Stroke width" min={1} max={20} value={style.strokeWidth} onChange={(strokeWidth) => updateStyle({ strokeWidth })} />
        </div>
      )}

      {showFill && (
        <div className="style-panel__section">
          <span className="style-panel__label">Fill</span>
          <div className="style-panel__fill-modes">
            {FILL_MODES.map((mode) => (
              <button
                key={mode.id}
                type="button"
                className={`style-panel__chip${style.fillMode === mode.id ? " style-panel__chip--active" : ""}`}
                onClick={() => updateStyle({ fillMode: mode.id })}
              >
                {mode.label}
              </button>
            ))}
          </div>
          {style.fillMode === "translucent" && (
            <Slider
              label="Fill opacity"
              min={0.05}
              max={0.9}
              step={0.05}
              value={style.fillOpacity}
              onChange={(fillOpacity) => updateStyle({ fillOpacity })}
            />
          )}
        </div>
      )}

      {showCornerRadius && (
        <div className="style-panel__section">
          <Slider label="Corner radius" min={0} max={48} value={style.cornerRadius} onChange={(cornerRadius) => updateStyle({ cornerRadius })} />
        </div>
      )}

      {showFontSize && (
        <div className="style-panel__section">
          <Slider label="Font size" min={12} max={96} value={style.fontSize} onChange={(fontSize) => updateStyle({ fontSize })} />
        </div>
      )}
    </div>
  );
}
