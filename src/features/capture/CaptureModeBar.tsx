import { Fragment } from "react";
import { AppWindow, ChevronsDown, Monitor, Scan, ScanText, type LucideIcon } from "lucide-react";
import { t } from "../../lib/i18n";
import "./CaptureModeBar.css";

/** What a drag (or click) on the overlay does. Fullscreen is not a mode: choosing it captures at once. */
export type CaptureMode = "area" | "window" | "scroll" | "text";
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
    { id: "scroll", icon: ChevronsDown, label: "overlay.modeScroll", key: "S" },
  ],
  [
    { id: "text", icon: ScanText, label: "overlay.modeText", key: "T" },
  ],
];

interface CaptureModeBarProps {
  mode: CaptureMode;
  onChoose: (choice: CaptureChoice) => void;
  /** The selection being dragged, in physical pixels; null when there is none. */
  size: { width: number; height: number } | null;
  /** What has been typed into the size boxes: when both are numbers, the capture is that size. */
  fixed: FixedSizeText;
  onFixedChange: (next: FixedSizeText) => void;
}

/** The size boxes' text. Digits only; empty means "not set". */
export interface FixedSizeText {
  width: string;
  height: string;
}

/**
 * The kinds of capture, in one row at the bottom of the overlay: what to do
 * is visible and clickable instead of something to remember. Each also has a
 * key, shown on hover. Beside it, the size of the selection: it shows the
 * drag as it happens, and typing a width and a height there makes the capture
 * exactly that size (a rectangle that follows the pointer, click to take it).
 *
 * Mouse events stop here: a click on the bar is not the start of a selection.
 */
export function CaptureModeBar({ mode, onChoose, size, fixed, onFixedChange }: CaptureModeBarProps) {
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
        {(["width", "height"] as const).map((field, index) => (
          <Fragment key={field}>
            {index > 0 && <span className="mode-bar__times">×</span>}
            <input
              className="mode-bar__size-box"
              inputMode="numeric"
              aria-label={t(field === "width" ? "overlay.width" : "overlay.height")}
              placeholder="–"
              value={fixed[field] || (size ? String(size[field]) : "")}
              onChange={(e) => onFixedChange({ ...fixed, [field]: e.target.value.replace(/D/g, "").slice(0, 5) })}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
            />
          </Fragment>
        ))}
      </div>
    </div>
  );
}
