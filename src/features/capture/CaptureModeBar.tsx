import { AppWindow, Monitor, Scan, ScanText, type LucideIcon } from "lucide-react";
import { t } from "../../lib/i18n";
import "./CaptureModeBar.css";

/** What a drag (or click) on the overlay does. Fullscreen is not a mode: choosing it captures at once. */
export type CaptureMode = "area" | "window" | "text";
export type CaptureChoice = CaptureMode | "fullscreen";

const CHOICES: { id: CaptureChoice; icon: LucideIcon; label: string; key: string | null }[] = [
  { id: "area", icon: Scan, label: "overlay.modeArea", key: null },
  { id: "fullscreen", icon: Monitor, label: "overlay.modeFullscreen", key: "F" },
  { id: "window", icon: AppWindow, label: "overlay.modeWindow", key: "Space" },
  { id: "text", icon: ScanText, label: "overlay.modeText", key: "T" },
];

interface CaptureModeBarProps {
  mode: CaptureMode;
  onChoose: (choice: CaptureChoice) => void;
}

/**
 * The kinds of capture, in one row at the bottom of the overlay: what to do
 * is visible and clickable instead of something to remember. Each also has a
 * key, shown on hover.
 *
 * Mouse events stop here: a click on the bar is not the start of a selection.
 */
export function CaptureModeBar({ mode, onChoose }: CaptureModeBarProps) {
  return (
    <div
      className="mode-bar"
      onMouseDown={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
      onMouseMove={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      {CHOICES.map(({ id, icon: Icon, label, key }) => (
        <button
          key={id}
          type="button"
          className={`mode-bar__button${id === mode ? " mode-bar__button--active" : ""}`}
          title={key ? `${t(label)} (${key})` : t(label)}
          onClick={() => onChoose(id)}
        >
          <Icon size={22} strokeWidth={1.75} />
          <span>{t(label)}</span>
        </button>
      ))}
    </div>
  );
}
