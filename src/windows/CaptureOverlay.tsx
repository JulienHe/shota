import { useCallback, useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { tauriApi } from "../lib/tauriApi";
import { useGlobalCursor } from "../features/capture/useGlobalCursor";
import { useWindowSnap } from "../features/capture/useWindowSnap";
import "./CaptureOverlay.css";

interface DragRect {
  startX: number;
  startY: number;
  x: number;
  y: number;
}

// Empirical correction (physical px) for the window-snap highlight: even
// using DWM's extended-frame-bounds (the standard "true visual window edge"
// API), the box still measured off to the right on the user's machine —
// verified as a pure horizontal translation, not a size error. 7px left it
// ~3px short, so tuned up to 10px based on direct user feedback rather than
// further Win32 theory.
const HORIZONTAL_HIGHLIGHT_CORRECTION_PX = 10;

export function CaptureOverlay() {
  const { cursor: globalCursor, origin, scale } = useGlobalCursor();
  const { snapMode, hoveredWindow } = useWindowSnap(globalCursor);
  const [drag, setDrag] = useState<DragRect | null>(null);

  const cancel = useCallback(() => {
    tauriApi.cancelCapture();
  }, []);

  // Toggling into window-snap mode mid-drag would otherwise leave a stale
  // selection rectangle stuck on screen, since nothing else clears it.
  useEffect(() => {
    if (snapMode) setDrag(null);
  }, [snapMode]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cancel]);

  useEffect(() => {
    // Every shota window shares one JS/CSS bundle (see App.tsx), so a plain
    // CSS rule targeting html/body/#root would leak into the other windows'
    // documents too. Each Tauri window is its own separate document though,
    // so setting this directly here only affects the overlay window's own
    // html/body/#root — safe to do without any cleanup on unmount.
    const root = document.getElementById("root");
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    if (root) root.style.background = "transparent";

    // The window is created hidden (see overlay.rs) specifically so it can't
    // flash WebView2's default white background before this runs. Wait a
    // couple of frames so the transparent styling has actually painted
    // before asking Rust to reveal the window.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        tauriApi.overlayReady();
      });
    });
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (snapMode) return;
    setDrag({ startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!drag) return;
    setDrag({ ...drag, x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = async () => {
    try {
      if (snapMode && hoveredWindow) {
        await tauriApi.finishWindowCapture(hoveredWindow.id);
        return;
      }
      if (!drag) return;

      const resolvedOrigin = origin ?? (await getCurrentWindow().outerPosition());

      const localX = Math.min(drag.startX, drag.x);
      const localY = Math.min(drag.startY, drag.y);
      const width = Math.abs(drag.x - drag.startX);
      const height = Math.abs(drag.y - drag.startY);
      setDrag(null);

      if (width < 4 || height < 4) return;

      await tauriApi.finishRegionCapture(
        Math.round(resolvedOrigin.x + localX * scale),
        Math.round(resolvedOrigin.y + localY * scale),
        Math.round(width * scale),
        Math.round(height * scale),
      );
    } catch (err) {
      // Otherwise a failed capture leaves the overlay hidden (Rust hides it
      // before attempting the capture) with nothing telling the user it
      // didn't work — cancel outright instead of leaving it in limbo.
      console.error("capture failed", err);
      setDrag(null);
      tauriApi.cancelCapture();
    }
  };

  const selectionStyle = drag
    ? {
        left: Math.min(drag.startX, drag.x),
        top: Math.min(drag.startY, drag.y),
        width: Math.abs(drag.x - drag.startX),
        height: Math.abs(drag.y - drag.startY),
      }
    : null;

  return (
    <div
      className="capture-overlay"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      <div className="capture-overlay__hint">
        {snapMode ? "Click a window to capture it · Space to go back" : "Drag to select an area · Space to switch to window mode · Esc to cancel"}
      </div>

      {snapMode && hoveredWindow && origin && (
        <div
          className="capture-overlay__window-highlight"
          style={{
            left: (hoveredWindow.x - origin.x - HORIZONTAL_HIGHLIGHT_CORRECTION_PX) / scale,
            top: (hoveredWindow.y - origin.y) / scale,
            width: hoveredWindow.width / scale,
            height: hoveredWindow.height / scale,
          }}
        />
      )}

      {selectionStyle && <div className="capture-overlay__selection" style={selectionStyle} />}
    </div>
  );
}
