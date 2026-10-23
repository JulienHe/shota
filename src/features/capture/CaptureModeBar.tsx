import { AppWindow, Monitor, Scan, ScanText, type LucideIcon } from "lucide-react";
import { t } from "../../lib/i18n";
import "./CaptureModeBar.css";

/** What a drag (or click) on the overlay does. Fullscreen is not a mode: choosing it captures at once. */
export type CaptureMode = "area" | "window" | "text";
export type CaptureChoice = CaptureMode | "fullscreen";

interface Choice {
  id: CaptureChoice;
  icon: LucideIcon;
  label: string;
  key: string | null;
}

/** Groups of choices; a thin line is drawn between groups. */
const GROUPS: Choice[][] = [
  [
    { id: "area", icon: Scan, label: "overlay.modeArea", key: null },
    { id: "fullscreen", icon: Monitor, label: "overlay.modeFullscreen", key: "F" },
    { id: "window", icon: AppWindow, label: "overlay.modeWindow", key: "Space" },
  ],
  [{ id: "text", icon: ScanText, label: "overlay.modeText", key: "T" }],
];

interface CaptureModeBarProps {
  mode: CaptureMode;
  onChoose: (choice: CaptureChoice) => void;
  /** The selection being dragged, in physical pixels; null when there is none. */
  size: { width: number; height: number } | null;
}

/**
 * The kinds of capture, in one row at the bottom of the overlay: what to do
 * is visible and clickable instead of something to remember. Each also has a
 * key, shown on hover. Beside it, the size of the selection.
 *
 * Mouse events stop here: a click on the bar is not the start of a selection.
 */
export function CaptureModeBar({ mode, onChoose, size }: CaptureModeBarProps) {
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <div
      className="mode-bar"
      onMouseDown={stop}
      onMouseUp={stop}
      onMouseMove={stop}
      onContextMenu={stop}
      onWheel={stop}
    >
      <div className="mode-bar__pill">
        {GROUPS.map((group, index) => (
          <div className="mode-bar__group" key={index}>
            {index > 0 && <span className="mode-bar__divider" />}
            {group.map(({ id, icon: Icon, label, key }) => (
              <button
                key={id}
                type="button"
                className={`mode-bar__button${id === mode ? " mode-bar__button--active" : ""}`}
                title={key ? `${t(label)} (${key})` : t(label)}
                onClick={() => onChoose(id)}
              >
                <Icon size={22} strokeWidth={1.6} />
                <span>{t(label)}</span>
              </button>
            ))}
          </div>
        ))}
      </div>

      <div className="mode-bar__pill mode-bar__pill--size" aria-label={t("overlay.size")}>
        <span className="mode-bar__size-box">{size ? size.width : "–"}</span>
        <span className="mode-bar__times">×</span>
        <span className="mode-bar__size-box">{size ? size.height : "–"}</span>
      </div>
    </div>
  );
}
