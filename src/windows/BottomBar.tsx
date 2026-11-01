import { useState } from "react";
import { Copy, FolderOpen, GripVertical, MoreHorizontal, Pin, Save, Share2 } from "lucide-react";
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

/**
 * Status bar: zoom bottom-left; bottom-right only what is used every time
 * (drag out, Copy, Save). Everything else (Share, Pin, export size, projects)
 * lives behind "More" so the bar stays calm as features are added.
 */
export function BottomBar({ zoom, onZoomChange, onZoomToFit, onCopy, onSave, onShare, onPin, onSaveProject, onOpenProject, onDragOut }: BottomBarProps) {
  const [zoomOpen, setZoomOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const exportScale = useUiStore((s) => s.exportScale);
  const setExportScale = useUiStore((s) => s.setExportScale);

  const closeThen = (action: () => void) => {
    setMoreOpen(false);
    action();
  };

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
            {t("editor.zoomToFit")}
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
          align="end"
          open={moreOpen}
          onToggle={() => setMoreOpen((o) => !o)}
          onClose={() => setMoreOpen(false)}
          trigger={
            <span title={t("editor.more")} className="bottom-bar__size-trigger">
              <MoreHorizontal size={16} strokeWidth={2} aria-label={t("editor.more")} />
              {exportScale !== 1 && `${Math.round(exportScale * 100)}%`}
            </span>
          }
        >
          <div className="bottom-bar__zoom-menu">
            <button type="button" className="dropdown__menu-item" onClick={() => closeThen(onShare)}>
              <Share2 size={15} strokeWidth={2} />
              {t("editor.share")}
            </button>
            <button type="button" className="dropdown__menu-item" onClick={() => closeThen(onPin)}>
              <Pin size={15} strokeWidth={2} />
              {t("editor.pin")}
            </button>
            <div className="bottom-bar__divider" />
            <div className="bottom-bar__menu-title">{t("editor.exportSize")}</div>
            <div className="bottom-bar__chips" role="radiogroup" aria-label={t("editor.exportSize")}>
              {EXPORT_SCALES.map((scale) => (
                <button
                  key={scale}
                  type="button"
                  role="radio"
                  aria-checked={scale === exportScale}
                  className={`bottom-bar__chip${scale === exportScale ? " bottom-bar__chip--active" : ""}`}
                  onClick={() => setExportScale(scale)}
                >
                  {Math.round(scale * 100)}%
                </button>
              ))}
            </div>
            <div className="bottom-bar__divider" />
            <button type="button" className="dropdown__menu-item" onClick={() => closeThen(onSaveProject)}>
              <Save size={15} strokeWidth={2} />
              {t("project.save")}
            </button>
            <button type="button" className="dropdown__menu-item" onClick={() => closeThen(onOpenProject)}>
              <FolderOpen size={15} strokeWidth={2} />
              {t("project.open")}
            </button>
          </div>
        </Dropdown>
        <IconButton icon={Copy} label={`${t("editor.copy")} (Ctrl+C)`} onClick={onCopy} />
        <IconButton icon={Save} label={`${t("editor.save")} (Ctrl+S)`} onClick={onSave} />
      </div>
    </div>
  );
}
