import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { TitleBar } from "./TitleBar";
import { BottomBar } from "./BottomBar";
import { Canvas, CanvasHandle } from "../features/annotate/Canvas";
import { useDocumentStore } from "../stores/documentStore";
import { useToastStore } from "../stores/toastStore";
import { useKeyboardShortcut } from "../lib/useKeyboardShortcut";
import { tauriApi, toBase64Payload, toDataUrl, PendingCapture } from "../lib/tauriApi";
import { primeImageCache } from "../lib/useImage";
import { closeEditor } from "../lib/editorClose";
import { Shape } from "../features/annotate/types";
import "./EditorWindow.css";

export function EditorWindow() {
  const canvasRef = useRef<CanvasHandle>(null);
  const hasImage = useDocumentStore((s) => s.image !== null);
  const loadImage = useDocumentStore((s) => s.loadImage);
  const replaceImage = useDocumentStore((s) => s.replaceImage);
  const setHistoryId = useDocumentStore((s) => s.setHistoryId);
  const undo = useDocumentStore((s) => s.undo);
  const redo = useDocumentStore((s) => s.redo);
  const toast = useToastStore((s) => s.message);
  const showToast = useToastStore((s) => s.show);
  const clearToast = useToastStore((s) => s.clear);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const applyCapture = (capture: PendingCapture) => {
      const img = new Image();
      img.onload = () => {
        // Canvas's background image (via useImage) reads from this exact
        // data URL next — seed it with the element already decoded here
        // instead of leaving it to redundantly decode the same multi-MB
        // image a second time, which is what was delaying the image behind
        // the toolbar/footer instead of them appearing together.
        primeImageCache(toDataUrl(capture.image_base64), img);

        const shapes: Shape[] | null = capture.shapes_json
          ? (() => {
              try {
                return JSON.parse(capture.shapes_json as string) as Shape[];
              } catch {
                return null;
              }
            })()
          : null;

        if (shapes) {
          replaceImage(toDataUrl(capture.image_base64), img.width, img.height, shapes);
        } else {
          loadImage(toDataUrl(capture.image_base64), img.width, img.height);
        }
        setHistoryId(capture.history_id);

        // The editor window is kept hidden by the Rust side until this
        // fires (see open_editor_window) — reveals it once the new image
        // has actually had a chance to paint, rather than the instant React
        // commits the state update, which is what was showing the *previous*
        // capture for a moment on every capture after the first.
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            tauriApi.editorReady();
          });
        });
      };
      img.onerror = () => console.error("failed to decode captured image");
      img.src = toDataUrl(capture.image_base64);
    };

    tauriApi
      .takePendingCapture()
      .then((pending) => {
        if (pending) applyCapture(pending);
      })
      .catch((err) => console.error("failed to take pending capture", err));

    const unlisten = listen<PendingCapture>("shota://new-capture", (event) => applyCapture(event.payload));
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [loadImage, replaceImage, setHistoryId]);

  // Safety net for a close path that isn't Copy/Save/the title bar's X
  // (all of which already persist annotations via `closeEditor` before
  // hiding) — e.g. Alt+F4 or the OS otherwise sending a real close request.
  useEffect(() => {
    const win = getCurrentWindow();
    const unlisten = win.onCloseRequested(() => {
      const { historyId, image, shapes } = useDocumentStore.getState();
      if (historyId && image) {
        tauriApi.updateHistoryEntry(historyId, toBase64Payload(image), JSON.stringify(shapes)).catch((err) => {
          console.error("failed to save history annotations", err);
        });
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Rendering the shapes/image at full native resolution and PNG-encoding
  // that (exportDataUrl) is a genuinely slow, synchronous, main-thread-
  // blocking operation for a large screenshot — nothing can paint while it
  // runs. Setting the "Preparing…" toast first and waiting a couple of
  // frames lets the browser actually paint it before that freeze starts,
  // instead of the click just appearing to do nothing until it's already
  // done. Copy doesn't need this anymore: its export is pre-warmed by
  // Canvas's background cache, so the click itself is effectively instant.
  const waitForPaint = () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

  const handleCopy = () => {
    const dataUrl = canvasRef.current?.exportDataUrl();
    if (!dataUrl) return;
    // The window closing immediately *is* the confirmation — like
    // CleanShot, there's no reason to linger once the export is handed off.
    // The clipboard write itself doesn't depend on this window staying
    // open (it runs in the Rust process, not the webview), so it's safe to
    // fire-and-forget rather than block the close on it.
    tauriApi.copyImageToClipboard(toBase64Payload(dataUrl)).catch((err) => {
      console.error("copy to clipboard failed", err);
    });
    closeEditor();
  };

  const handleSave = async () => {
    showToast("Preparing…", 10000);
    await waitForPaint();
    const dataUrl = canvasRef.current?.exportDataUrl();
    if (!dataUrl) {
      clearToast();
      return;
    }
    const name = `shota-${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
    try {
      const path = await tauriApi.saveImageAs(toBase64Payload(dataUrl), name);
      // `path` is null if the user cancelled the native save dialog — stay
      // open in that case since nothing actually happened. On an actual
      // save, close right away rather than clearing the toast and lingering.
      if (path) {
        closeEditor();
      } else {
        clearToast();
      }
    } catch (err) {
      console.error("save failed", err);
      showToast("Save failed — try again");
    }
  };

  useKeyboardShortcut({ ctrl: true, key: "c" }, handleCopy, []);
  useKeyboardShortcut({ ctrl: true, key: "s" }, handleSave, []);
  useKeyboardShortcut({ ctrl: true, key: "z" }, undo, [undo]);
  useKeyboardShortcut({ ctrl: true, shift: true, key: "z" }, redo, [redo]);

  // Rendering the title bar/footer chrome before the image has decoded was
  // exactly the "window appears, then toolbar, then image" staggered
  // reveal that reads as the app blinking — holding off until there's an
  // image makes everything appear together in one frame instead.
  if (!hasImage) return null;

  return (
    <div className="editor-window">
      <TitleBar />
      <div className="editor-window__canvas-area">
        <Canvas ref={canvasRef} onZoomChange={setZoom} />
        {toast && <div className="editor-window__toast">{toast}</div>}
      </div>
      <BottomBar
        zoom={zoom}
        onZoomChange={(scale) => canvasRef.current?.setZoom(scale)}
        onZoomToFit={() => canvasRef.current?.zoomToFit()}
        onCopy={handleCopy}
        onSave={handleSave}
      />
    </div>
  );
}
