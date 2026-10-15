import { useState } from "react";
import { Copy, GripVertical, Save, Share2 } from "lucide-react";
import { IconButton } from "../components/IconButton";
import { Dropdown } from "../components/Dropdown";
import "./BottomBar.css";
import { t } from "../lib/i18n";

const ZOOM_PRESETS = [0.5, 1, 1.5, 2];

interface BottomBarProps {
  zoom: number;
  onZoomChange: (scale: number) => void;
  onZoomToFit: () => void;
  onCopy: () => void;
  onSave: () => void;
  onShare: () => void;
  /** Called on mouse down on the drag handle; starts a native drag of the image. */
  onDragOut: () => void;
}

/** CleanShot-style status bar: zoom control bottom-left, Copy/Save bottom-right. */
export function BottomBar({ zoom, onZoomChange, onZoomToFit, onCopy, onSave, onShare, onDragOut }: BottomBarProps) {
  const [zoomOpen, setZoomOpen] = useState(false);

  return (
    <div className="bottom-bar" data-tauri-drag-region="deep">
      <Dropdown
        placement="top"
        align="start"
        open={zoomOpen}
        onToggle={() => setZoomOpen((o) => !o)}
        onClose={() => setZoomOpen(false)}
        trigger={`${Math.round(zoom * 100)}%`}
      >
        <div className="bottom-bar__zoom-menu">
          <button
            type="button"
            className="dropdown__menu-item"
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
              className={`dropdown__menu-item${Math.abs(zoom - preset) < 0.001 ? " dropdown__menu-item--active" : ""}`}
              onClick={() => {
                onZoomChange(preset);
                setZoomOpen(false);
              }}
            >
              {Math.round(preset * 100)}%
            </button>
          ))}
        </div>
      </Dropdown>

      <div className="bottom-bar__actions">
        <button
          type="button"
          className="icon-button bottom-bar__drag"
          title={t("editor.dragOut")}
          aria-label={t("editor.dragOut")}
          data-tauri-drag-region="false"
          onMouseDown={(event) => {
            if (event.button === 0) onDragOut();
          }}
        >
          <GripVertical size={18} strokeWidth={2} />
        </button>
        <IconButton icon={Share2} label={t("editor.share")} onClick={onShare} />
        <IconButton icon={Copy} label={`${t("editor.copy")} (Ctrl+C)`} onClick={onCopy} />
        <IconButton icon={Save} label={`${t("editor.save")} (Ctrl+S)`} onClick={onSave} />
      </div>
    </div>
  );
}
