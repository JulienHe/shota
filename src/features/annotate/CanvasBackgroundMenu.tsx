import { useEffect, useRef } from "react";
import { Check, SunMoon } from "lucide-react";
import { CanvasBackground, useUiStore } from "../../stores/uiStore";
import "./CanvasBackgroundMenu.css";
import { t } from "../../lib/i18n";

interface Option {
  id: CanvasBackground;
  label: string;
  swatch: string | null; // null = "system" — shown as a SunMoon icon instead of a color swatch
}

// `label` is a translation key, resolved at render rather than here: this
// array is module-level and would otherwise be built before the locale is known.
const OPTIONS: Option[] = [
  { id: "white", label: "background.white", swatch: "#ffffff" },
  { id: "light-gray", label: "background.lightGray", swatch: "#c9c9cc" },
  { id: "gray", label: "background.gray", swatch: "#8a8a8f" },
  { id: "dark-gray", label: "background.darkGray", swatch: "#3f3f46" },
  { id: "black", label: "background.black", swatch: "#000000" },
  { id: "system", label: "background.system", swatch: null },
];

interface CanvasBackgroundMenuProps {
  x: number;
  y: number;
  onClose: () => void;
}

/** Photoshop-style right-click menu for the workspace background behind the image. */
export function CanvasBackgroundMenu({ x, y, onClose }: CanvasBackgroundMenuProps) {
  const canvasBackground = useUiStore((s) => s.canvasBackground);
  const setCanvasBackground = useUiStore((s) => s.setCanvasBackground);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return (
    <div className="canvas-bg-menu" ref={ref} style={{ left: x, top: y }}>
      {OPTIONS.map((opt) => (
        <button
          key={opt.id}
          type="button"
          className="canvas-bg-menu__item"
          onClick={() => {
            setCanvasBackground(opt.id);
            onClose();
          }}
        >
          {opt.swatch ? (
            <span className="canvas-bg-menu__swatch" style={{ background: opt.swatch }} />
          ) : (
            <SunMoon size={16} strokeWidth={2} className="canvas-bg-menu__system-icon" />
          )}
          <span className="canvas-bg-menu__label">{t(opt.label)}</span>
          {canvasBackground === opt.id && <Check size={14} strokeWidth={2.5} />}
        </button>
      ))}
    </div>
  );
}
