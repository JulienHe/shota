import { useRef, useState } from "react";
import { ChevronUp, Copy, Save } from "lucide-react";
import { IconButton } from "../components/IconButton";
import { Popover } from "../components/Popover";
import "./BottomBar.css";

const ZOOM_PRESETS = [0.5, 1, 1.5, 2];

interface BottomBarProps {
  zoom: number;
  onZoomChange: (scale: number) => void;
  onZoomToFit: () => void;
  onCopy: () => void;
  onSave: () => void;
}

/** CleanShot-style status bar: zoom control bottom-left, Copy/Save bottom-right. */
export function BottomBar({ zoom, onZoomChange, onZoomToFit, onCopy, onSave }: BottomBarProps) {
  const [zoomOpen, setZoomOpen] = useState(false);
  const zoomAnchorRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="bottom-bar" data-tauri-drag-region="deep">
      <div className="bottom-bar__zoom-anchor">
        <button ref={zoomAnchorRef} type="button" className="bottom-bar__zoom" onClick={() => setZoomOpen((o) => !o)}>
          {Math.round(zoom * 100)}%
          <ChevronUp size={13} strokeWidth={2} />
        </button>
        <Popover placement="top" align="start" open={zoomOpen} onClose={() => setZoomOpen(false)} anchorRef={zoomAnchorRef}>
          <div className="bottom-bar__zoom-menu">
            <button
              type="button"
              className="bottom-bar__zoom-option"
              onClick={() => {
                onZoomToFit();
                setZoomOpen(false);
              }}
            >
              Fit to window
            </button>
            {ZOOM_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                className={`bottom-bar__zoom-option${Math.abs(zoom - preset) < 0.001 ? " bottom-bar__zoom-option--active" : ""}`}
                onClick={() => {
                  onZoomChange(preset);
                  setZoomOpen(false);
                }}
              >
                {Math.round(preset * 100)}%
              </button>
            ))}
          </div>
        </Popover>
      </div>

      <div className="bottom-bar__actions">
        <IconButton icon={Copy} label="Copy (Ctrl+C)" onClick={onCopy} />
        <IconButton icon={Save} label="Save as… (Ctrl+S)" onClick={onSave} />
      </div>
    </div>
  );
}
