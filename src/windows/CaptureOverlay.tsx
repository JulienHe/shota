import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { tauriApi } from "../lib/tauriApi";
import { useKeyboardShortcut } from "../lib/useKeyboardShortcut";
import { afterNextPaint, useTransparentWindow } from "../lib/windowChrome";
import { useGlobalCursor } from "../features/capture/useGlobalCursor";
import { useWindowSnap } from "../features/capture/useWindowSnap";
import { SpotlightMask, HoleRect } from "../features/capture/SpotlightMask";
import "./CaptureOverlay.css";
import { t } from "../lib/i18n";

interface DragRect {
  startX: number;
  startY: number;
  x: number;
  y: number;
}

// Empirical correction (physical px) for the window-snap highlight: even
// using DWM's extended-frame-bounds (the standard "true visual window edge"
// API), the box still measured off to the right on the user's machine ~
// verified as a pure horizontal translation, not a size error. 7px left it
// ~3px short, so tuned up to 10px based on direct user feedback rather than
// further Win32 theory.
const HORIZONTAL_HIGHLIGHT_CORRECTION_PX = 10;

export function CaptureOverlay() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // The last frozen screen handled, so the event and the on-mount check can't
  // both paint the same one.
  const handled = useRef<number | null>(null);

  const { cursor: globalCursor, origin, scale } = useGlobalCursor();
  const { snapMode, hoveredWindow } = useWindowSnap(globalCursor);
  const [drag, setDrag] = useState<DragRect | null>(null);

  const cancel = useCallback(() => {
    // The overlay window is hidden and reused rather than destroyed, so
    // React never remounts between captures ~ leaving `drag` set here would
    // show next time's overlay with this time's stale selection rectangle
    // still drawn (at coordinates that no longer mean anything).
    setDrag(null);
    tauriApi.cancelCapture();
  }, []);

  // Toggling into window-snap mode mid-drag would otherwise leave a stale
  // selection rectangle stuck on screen, since nothing else clears it.
  useEffect(() => {
    if (snapMode) setDrag(null);
  }, [snapMode]);

  useKeyboardShortcut({ key: "Escape" }, cancel, [cancel]);

  useTransparentWindow();

  // The overlay shows a still copy of the screen taken the moment the shortcut
  // was pressed, instead of the live one: what you select is what you saw, even
  // if a video, a tooltip or a hover menu has since changed. Rust keeps the
  // window hidden until this has painted, so the live screen never jumps to it.
  const showFrozen = useCallback(async (id: number) => {
    if (handled.current === id && id !== 0) return;
    handled.current = id;
    const canvas = canvasRef.current;
    try {
      if (canvas) {
        const context = canvas.getContext("2d");
        if (id === 0 || !context) {
          // No frozen screen this time: clear the last one so it can't show.
          context?.clearRect(0, 0, canvas.width, canvas.height);
        } else {
          const bytes = await tauriApi.takeFreeze(id);
          const [width, height] = new Int32Array(bytes, 0, 4);
          canvas.width = width;
          canvas.height = height;
          const pixels = new Uint8ClampedArray(bytes, 16, width * height * 4);
          context.putImageData(new ImageData(pixels, width, height), 0, 0);
        }
      }
      await afterNextPaint();
    } catch (err) {
      // Better an overlay over the live screen than none at all.
      console.error("could not paint the frozen screen", err);
    }
    tauriApi.overlayPainted(id).catch((err) => console.error("overlay_painted failed", err));
  }, []);

  useEffect(() => {
    const unlisten = listen<number>("shota://freeze", (event) => {
      handled.current = null;
      void showFrozen(event.payload);
    });
    // A capture asked for before this page had mounted: its event was lost, so ask.
    tauriApi
      .pendingFreezeId()
      .then((id) => {
        if (id !== null) void showFrozen(id);
      })
      .catch(() => {});
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [showFrozen]);

  useEffect(() => {
    // The window is created hidden (see overlay.rs) specifically so it can't
    // flash WebView2's default white background before this runs. Waiting for
    // a real paint means the transparent styling above has actually landed
    // before Rust is asked to reveal the window.
    afterNextPaint().then(() => tauriApi.overlayReady());
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
      // didn't work ~ cancel outright instead of leaving it in limbo.
      console.error("capture failed", err);
      setDrag(null);
      tauriApi.cancelCapture();
    }
  };

  // The hovered window in overlay-local CSS pixels, shared by the dimming
  // mask and the border drawn on top of it so the two can't disagree.
  const spotlightRect: HoleRect | null =
    snapMode && hoveredWindow && origin
      ? {
          left: (hoveredWindow.x - origin.x - HORIZONTAL_HIGHLIGHT_CORRECTION_PX) / scale,
          top: (hoveredWindow.y - origin.y) / scale,
          width: hoveredWindow.width / scale,
          height: hoveredWindow.height / scale,
        }
      : null;

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
      <canvas ref={canvasRef} className="capture-overlay__frozen" />

      <div className="capture-overlay__hint">
        {snapMode ? t("overlay.snapHint") : t("overlay.dragHint")}
      </div>

      {snapMode && <SpotlightMask hole={spotlightRect} />}

      {spotlightRect && <div className="capture-overlay__window-highlight" style={spotlightRect} />}

      {selectionStyle && <div className="capture-overlay__selection" style={selectionStyle} />}
    </div>
  );
}
