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

export function CaptureOverlay() {
  const { cursor: globalCursor, origin, scale } = useGlobalCursor();
  const { snapMode, hoveredWindow } = useWindowSnap(globalCursor);
  const [drag, setDrag] = useState<DragRect | null>(null);

  const cancel = useCallback(() => {
    tauriApi.cancelCapture();
  }, []);

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
        {snapMode ? "Click a window to capture it" : "Drag to select an area · hold Space to snap to a window · Esc to cancel"}
      </div>

      {snapMode && hoveredWindow && origin && (
        <div
          className="capture-overlay__window-highlight"
          style={{
            left: (hoveredWindow.x - origin.x) / scale,
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
