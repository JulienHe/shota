import { useEffect, useRef, useState } from "react";
import { getCurrentWindow, PhysicalSize } from "@tauri-apps/api/window";
import { X } from "lucide-react";
import { tauriApi } from "../lib/tauriApi";
import { useTransparentWindow } from "../lib/windowChrome";
import { t } from "../lib/i18n";
import "./PinWindow.css";

/** How far a pin can be shrunk or enlarged, as a multiple of its real size. */
const MIN_SCALE = 0.1;
const MAX_SCALE = 4;
/** Each wheel notch changes the size by this factor. */
const STEP = 1.1;
const MIN_OPACITY = 0.2;

/**
 * A screenshot kept on screen above every other window.
 *
 * Drag it to move it, scroll to make it bigger or smaller, Ctrl+scroll to
 * fade it, right-click to copy it, and double-click, Esc or the cross to put
 * it away.
 */
export function PinWindow({ label }: { label: string }) {
  const id = Number(label.slice("pin-".length));
  const [src, setSrc] = useState<string | null>(null);
  const [opacity, setOpacity] = useState(1);
  const [note, setNote] = useState<string | null>(null);
  // The window's size when it opened: the 100% the scale is measured against.
  const baseSize = useRef<{ width: number; height: number } | null>(null);
  const scale = useRef(1);
  const noteTimer = useRef<number | undefined>(undefined);

  useTransparentWindow();

  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    tauriApi
      .takePinImage(id)
      .then((bytes) => {
        if (cancelled) return;
        url = URL.createObjectURL(new Blob([bytes], { type: "image/png" }));
        setSrc(url);
      })
      .catch((err) => {
        console.error("could not load the pinned image", err);
        void getCurrentWindow().close();
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [id]);

  const close = () => void getCurrentWindow().close();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const say = (message: string) => {
    setNote(message);
    window.clearTimeout(noteTimer.current);
    noteTimer.current = window.setTimeout(() => setNote(null), 1200);
  };

  const handleWheel = async (e: React.WheelEvent) => {
    if (e.deltaY === 0) return;
    const direction = e.deltaY < 0 ? 1 : -1;

    if (e.ctrlKey) {
      setOpacity((current) => Math.min(1, Math.max(MIN_OPACITY, current + direction * 0.1)));
      return;
    }

    const win = getCurrentWindow();
    if (!baseSize.current) {
      const size = await win.innerSize();
      baseSize.current = { width: size.width, height: size.height };
    }
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale.current * (direction > 0 ? STEP : 1 / STEP)));
    if (next === scale.current) return;
    scale.current = next;
    await win.setSize(
      new PhysicalSize(
        Math.max(1, Math.round(baseSize.current.width * next)),
        Math.max(1, Math.round(baseSize.current.height * next)),
      ),
    );
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    tauriApi
      .copyPinImage(id)
      .then(() => say(t("pin.copied")))
      .catch((err) => console.error("copying the pin failed", err));
  };

  return (
    <div
      className="pin"
      style={{ opacity }}
      data-tauri-drag-region
      onWheel={handleWheel}
      onContextMenu={handleContextMenu}
      onDoubleClick={close}
    >
      {src && <img className="pin__image" src={src} alt="" draggable={false} />}
      <button
        type="button"
        className="pin__close"
        title={t("pin.close")}
        aria-label={t("pin.close")}
        data-tauri-drag-region="false"
        onClick={close}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <X size={14} strokeWidth={2.5} />
      </button>
      {note && <div className="pin__note">{note}</div>}
    </div>
  );
}
