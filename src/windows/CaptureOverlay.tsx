import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { tauriApi } from "../lib/tauriApi";
import { useKeyboardShortcut } from "../lib/useKeyboardShortcut";
import { afterNextPaint, useTransparentWindow } from "../lib/windowChrome";
import { useGlobalCursor } from "../features/capture/useGlobalCursor";
import { useWindowSnap } from "../features/capture/useWindowSnap";
import { SpotlightMask, HoleRect } from "../features/capture/SpotlightMask";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { CaptureModeBar, CaptureChoice, CaptureMode, FixedSizeText } from "../features/capture/CaptureModeBar";
import { DEFAULT_SPAN_INDEX, hexAt, Magnifier, SPANS } from "../features/capture/Magnifier";
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

const HINT_KEYS = {
  window: "overlay.snapHint",
  text: "overlay.textHint",
  scroll: "overlay.scrollHint",
  area: "overlay.dragHint",
} as const;

const LOUPE_ZOOM_KEY = "shota.loupeZoom";
const NO_FIXED_SIZE: FixedSizeText = { width: "", height: "" };

/** The loupe's zoom, remembered between captures (and restarts, where storage allows). */
function readLoupeZoom(): number {
  try {
    const stored = Number(window.localStorage.getItem(LOUPE_ZOOM_KEY));
    if (Number.isInteger(stored) && stored >= 0 && stored < SPANS.length) return stored;
  } catch {
    // Storage can be unavailable; the default is fine.
  }
  return DEFAULT_SPAN_INDEX;
}

export function CaptureOverlay() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // The last frozen screen handled, so the event and the on-mount check can't
  // both paint the same one.
  const handled = useRef<number | null>(null);

  const { cursor: globalCursor, origin, scale } = useGlobalCursor();
  const { snapMode, setSnapMode, hoveredWindow } = useWindowSnap(globalCursor);
  const [drag, setDrag] = useState<DragRect | null>(null);
  // Where the pointer is in the window (CSS px), for the loupe.
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const [spanIndex, setSpanIndex] = useState(readLoupeZoom);
  // T switches the selection from "take a picture" to "copy the text (or QR
  // code) in it". Each capture starts in picture mode.
  const [textMode, setTextMode] = useState(false);
  // S switches the selection to "scroll and capture it all" (beta).
  const [scrollMode, setScrollMode] = useState(false);
  // Opened over the live screen (the toolbar shortcut): nothing is frozen.
  const [liveScreen, setLiveScreen] = useState(false);
  // Set when this page itself asked for a fresh frozen screen: the mode the
  // user just chose has to survive it (a new capture otherwise starts in area).
  const keepMode = useRef(false);
  // Typed into the bar's size boxes: when both are numbers, a capture is that
  // size, a rectangle following the pointer that a click takes.
  // Each capture starts without one (see the freeze listener).
  const [fixedText, setFixedText] = useState<FixedSizeText>(NO_FIXED_SIZE);
  const mode: CaptureMode = snapMode
    ? "window"
    : textMode
      ? "text"
      : scrollMode
        ? "scroll"
        : "area";
  const chooseRef = useRef<(choice: CaptureChoice) => void>(() => {});
  // The answer to a text selection, shown in the middle of the screen.
  const [status, setStatus] = useState<{ working: boolean; message: string } | null>(null);
  // What was just copied with a right click, shown in the loupe for a moment.
  const [copied, setCopied] = useState<string | null>(null);
  const copiedTimer = useRef<number | undefined>(undefined);

  // Clears a pending "Copied" timer if the overlay unmounts.
  useEffect(() => () => window.clearTimeout(copiedTimer.current), []);

  const cancel = useCallback(() => {
    // The overlay window is hidden and reused rather than destroyed, so
    // React never remounts between captures ~ leaving `drag` set here would
    // show next time's overlay with this time's stale selection rectangle
    // still drawn (at coordinates that no longer mean anything).
    setDrag(null);
    setPointer(null);
    tauriApi.cancelCapture();
  }, []);

  // Toggling into window-snap mode mid-drag would otherwise leave a stale
  // selection rectangle stuck on screen, since nothing else clears it.
  // It also isn't a selection to read or scroll, so leave those modes.
  useEffect(() => {
    if (snapMode) {
      setDrag(null);
      setTextMode(false);
      setScrollMode(false);
    }
  }, [snapMode]);

  useKeyboardShortcut({ key: "Escape" }, cancel, [cancel]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.altKey || e.metaKey) return;
      // Typing in the size boxes is not a mode key.
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === "KeyT") {
        e.preventDefault();
        chooseRef.current("text");
      } else if (e.code === "KeyS") {
        e.preventDefault();
        chooseRef.current("scroll");
      } else if (e.code === "KeyF") {
        e.preventDefault();
        chooseRef.current("fullscreen");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

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
        const context = canvas.getContext("2d", { willReadFrequently: true });
        setLiveScreen(id === 0);
        if (id === 0 || !context) {
          // No frozen screen this time: clear the last one so it can't show.
          context?.clearRect(0, 0, canvas.width, canvas.height);
        } else {
          // Nothing of the last capture may be on show while the new one loads.
          context.clearRect(0, 0, canvas.width, canvas.height);
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
    // Hidden: forget the frozen picture, so the next reveal can never flash
    // the previous capture's screen before the new one is drawn.
    const unlisten = listen("shota://overlay-hidden", () => {
      const canvas = canvasRef.current;
      canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    const unlisten = listen<number>("shota://freeze", (event) => {
      handled.current = null;
      if (keepMode.current) {
        keepMode.current = false;
      } else {
        // Every capture starts in area mode, whatever the last one used. The page
        // is reused, so nothing resets by itself.
        setTextMode(false);
        setScrollMode(false);
        setSnapMode(false);
        setFixedText(NO_FIXED_SIZE);
      }
      setStatus(null);
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
  }, [showFrozen, setSnapMode]);

  useEffect(() => {
    // The window is created hidden (see overlay.rs) specifically so it can't
    // flash WebView2's default white background before this runs. Waiting for
    // a real paint means the transparent styling above has actually landed
    // before Rust is asked to reveal the window.
    afterNextPaint()
      .then(() => tauriApi.overlayReady())
      .catch((err) => console.error("overlay_ready failed", err));
  }, []);

  // Picks a kind of capture. Fullscreen is not a mode, it captures at once.
  const choose = (choice: CaptureChoice) => {
    if (status) return;
    if (choice === "fullscreen") {
      setPointer(null);
      tauriApi.finishFullscreenCapture().catch((err) => {
        console.error("fullscreen capture failed", err);
        cancel();
      });
      return;
    }
    setDrag(null);
    if (liveScreen && choice === "text") {
      // Reading text needs a still picture: freeze the screen now.
      keepMode.current = true;
      tauriApi.refreezeOverlay().catch(() => {
        keepMode.current = false;
      });
    }
    setTextMode(choice === "text");
    setScrollMode(choice === "scroll");
    setSnapMode(choice === "window");
  };
  chooseRef.current = choose;

  // Scrolling zooms the loupe: up for closer, down for wider.
  const handleWheel = (e: React.WheelEvent) => {
    if (e.deltaY === 0) return;
    setSpanIndex((current) => {
      const next = Math.min(SPANS.length - 1, Math.max(0, current + (e.deltaY < 0 ? -1 : 1)));
      try {
        window.localStorage.setItem(LOUPE_ZOOM_KEY, String(next));
      } catch {
        // Not remembered; still applies for this capture.
      }
      return next;
    });
  };

  // Right click copies the colour under the cursor, and the capture carries on.
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (snapMode || !canvas || canvas.width === 0) return;
    const ratio = canvas.width / window.innerWidth;
    const hex = hexAt(canvas, Math.round(e.clientX * ratio), Math.round(e.clientY * ratio));
    if (!hex) return;
    setCopied(t("editor.copiedHex", { hex }));
    window.clearTimeout(copiedTimer.current);
    copiedTimer.current = window.setTimeout(() => setCopied(null), 1500);
    writeText(hex).catch((err) => {
      console.error("copy hex failed", err);
      setCopied(t("editor.copyFailed"));
    });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    // Only the primary button starts a selection; a right click copies a colour.
    if (e.button !== 0 || status) return;
    if (snapMode) return;
    if (fixedRect) {
      // A set size: the click takes the rectangle under the pointer.
      setPointer(null);
      complete(fixedRect.left, fixedRect.top, fixedRect.width, fixedRect.height).catch((err) => {
        console.error("capture failed", err);
        tauriApi.cancelCapture();
      });
      return;
    }
    setDrag({ startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    setPointer({ x: e.clientX, y: e.clientY });
    if (!drag) return;
    setDrag({ ...drag, x: e.clientX, y: e.clientY });
  };

  // Reads the text (or QR code) in the selection, says what happened, and
  // closes. The result is already on the clipboard by then.
  const readSelection = async (x: number, y: number, width: number, height: number) => {
    setStatus({ working: true, message: t("overlay.recognizing") });
    let message: string;
    try {
      const found = await tauriApi.finishTextCapture(x, y, width, height);
      if (found.kind === "qr") message = t("overlay.qrCopied");
      else if (found.kind === "text") message = t("overlay.textCopied", { count: found.text.length });
      else message = t("overlay.noText");
    } catch (err) {
      console.error("reading the selection failed", err);
      message = t("overlay.ocrUnavailable");
    }
    setStatus({ working: false, message });
    window.setTimeout(cancel, 1200);
  };

  // Takes the selection `(localX, localY, width, height)`, in overlay CSS
  // pixels, in whichever way the current mode says.
  const complete = async (localX: number, localY: number, width: number, height: number) => {
    const resolvedOrigin = origin ?? (await getCurrentWindow().outerPosition());
    setPointer(null);

    // The selection in physical screen pixels.
    const rect = [
      Math.round(resolvedOrigin.x + localX * scale),
      Math.round(resolvedOrigin.y + localY * scale),
      Math.round(width * scale),
      Math.round(height * scale),
    ] as const;

    if (scrollMode) await tauriApi.finishScrollSelection(...rect);
    else if (textMode) await readSelection(...rect);
    else await tauriApi.finishRegionCapture(...rect);
  };

  const handleMouseUp = async () => {
    try {
      if (snapMode && hoveredWindow) {
        setPointer(null);
        await tauriApi.finishWindowCapture(hoveredWindow.id);
        return;
      }
      if (!drag) return;

      const localX = Math.min(drag.startX, drag.x);
      const localY = Math.min(drag.startY, drag.y);
      const width = Math.abs(drag.x - drag.startX);
      const height = Math.abs(drag.y - drag.startY);
      setDrag(null);

      if (width < 4 || height < 4) return;
      await complete(localX, localY, width, height);
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

  // The rectangle of the typed size, centred on the pointer and kept on screen.
  const fixedWidth = Number(fixedText.width);
  const fixedHeight = Number(fixedText.height);
  const fixedRect =
    !snapMode && !drag && pointer && fixedWidth >= 8 && fixedHeight >= 8
      ? (() => {
          const width = Math.min(fixedWidth / scale, window.innerWidth);
          const height = Math.min(fixedHeight / scale, window.innerHeight);
          return {
            left: Math.min(Math.max(pointer.x - width / 2, 0), window.innerWidth - width),
            top: Math.min(Math.max(pointer.y - height / 2, 0), window.innerHeight - height),
            width,
            height,
          };
        })()
      : null;

  const selectionStyle = fixedRect ?? (drag
    ? {
        left: Math.min(drag.startX, drag.x),
        top: Math.min(drag.startY, drag.y),
        width: Math.abs(drag.x - drag.startX),
        height: Math.abs(drag.y - drag.startY),
      }
    : null);

  // Physical pixels per CSS pixel of the frozen screen: the unit a capture is
  // actually made in, and the one worth showing.
  const frozenRatio = canvasRef.current && canvasRef.current.width > 0 ? canvasRef.current.width / window.innerWidth : scale;
  const selectionSize = selectionStyle
    ? { width: Math.round(selectionStyle.width * frozenRatio), height: Math.round(selectionStyle.height * frozenRatio) }
    : null;
  return (
    <div
      className={`capture-overlay${scrollMode || liveScreen ? " capture-overlay--live" : ""}`}
      onMouseDown={handleMouseDown}
      onWheel={handleWheel}
      onContextMenu={handleContextMenu}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      <canvas ref={canvasRef} className="capture-overlay__frozen" />

      <div className="capture-overlay__hint">
        {t(HINT_KEYS[mode])}
        {mode === "area" && <div className="capture-overlay__hint-sub">{t("overlay.loupeHint")}</div>}
      </div>

      {snapMode && <SpotlightMask hole={spotlightRect} />}

      {spotlightRect && <div className="capture-overlay__window-highlight" style={spotlightRect} />}

      {selectionStyle && (
        <div
          className={`capture-overlay__selection${textMode ? " capture-overlay__selection--text" : ""}`}
          style={selectionStyle}
        />
      )}

      <CaptureModeBar mode={mode} onChoose={choose} size={selectionSize} fixed={fixedText} onFixedChange={setFixedText} />

      {status && (
        <div className="capture-overlay__status">
          {status.working && <span className="capture-overlay__spinner" />}
          {status.message}
        </div>
      )}

      {!snapMode && !scrollMode && !liveScreen && pointer && (
        <Magnifier source={canvasRef} x={pointer.x} y={pointer.y} span={SPANS[spanIndex]} caption={copied} />
      )}
    </div>
  );
}
