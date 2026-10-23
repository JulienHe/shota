import { useState } from "react";
import { Copy, FolderOpen, GripVertical, MoreHorizontal, Pin, Save, Scaling, Share2 } from "lucide-react";
import { EXPORT_SCALES, useUiStore } from "../stores/uiStore";
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
  onPin: () => void;
  onSaveProject: () => void;
  onOpenProject: () => void;
  /** Called on mouse down on the drag handle; starts a native drag of the image. */
  onDragOut: () => void;
}

/** CleanShot-style status bar: zoom control bottom-left, Copy/Save bottom-right. */
export function BottomBar({ zoom, onZoomChange, onZoomToFit, onCopy, onSave, onShare, onPin, onSaveProject, onOpenProject, onDragOut }: BottomBarProps) {
  const [zoomOpen, setZoomOpen] = useState(false);
  const [sizeOpen, setSizeOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const exportScale = useUiStore((s) => s.exportScale);
  const setExportScale = useUiStore((s) => s.setExportScale);

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
        <Dropdown
          placement="top"
          align="center"
          open={sizeOpen}
          onToggle={() => setSizeOpen((o) => !o)}
          onClose={() => setSizeOpen(false)}
          trigger={
            <span title={t("editor.exportSize")} className="bottom-bar__size-trigger">
              <Scaling size={15} strokeWidth={2} />
              {exportScale !== 1 && `${Math.round(exportScale * 100)}%`}
            </span>
          }
        >
          <div className="bottom-bar__zoom-menu">
            <div className="bottom-bar__menu-title">{t("editor.exportSize")}</div>
            {EXPORT_SCALES.map((scale) => (
              <button
                key={scale}
                type="button"
                className={`dropdown__menu-item${scale === exportScale ? " dropdown__menu-item--active" : ""}`}
                onClick={() => {
                  setExportScale(scale);
                  setSizeOpen(false);
                }}
              >
                {Math.round(scale * 100)}%
              </button>
            ))}
          </div>
        </Dropdown>
        <Dropdown
          placement="top"
          align="center"
          open={moreOpen}
          onToggle={() => setMoreOpen((o) => !o)}
          onClose={() => setMoreOpen(false)}
          trigger={<MoreHorizontal size={16} strokeWidth={2} aria-label={t("editor.more")} />}
        >
          <div className="bottom-bar__zoom-menu">
            <button
              type="button"
              className="dropdown__menu-item"
              onClick={() => {
                setMoreOpen(false);
                onSaveProject();
              }}
            >
              <Save size={15} strokeWidth={2} />
              {t("project.save")}
            </button>
            <button
              type="button"
              className="dropdown__menu-item"
              onClick={() => {
                setMoreOpen(false);
                onOpenProject();
              }}
            >
              <FolderOpen size={15} strokeWidth={2} />
              {t("project.open")}
            </button>
          </div>
        </Dropdown>
        <IconButton icon={Share2} label={t("editor.share")} onClick={onShare} />
        <IconButton icon={Pin} label={t("editor.pin")} onClick={onPin} />
        <IconButton icon={Copy} label={`${t("editor.copy")} (Ctrl+C)`} onClick={onCopy} />
        <IconButton icon={Save} label={`${t("editor.save")} (Ctrl+S)`} onClick={onSave} />
      </div>
    </div>
  );
}
