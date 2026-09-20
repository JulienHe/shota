import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

import { TitleBar } from "./TitleBar";
import { BottomBar } from "./BottomBar";
import { Canvas, CanvasHandle } from "../features/annotate/Canvas";
import { useDocumentStore } from "../stores/documentStore";
import { useToastStore } from "../stores/toastStore";
import { useKeyboardShortcut } from "../lib/useKeyboardShortcut";
import { tauriApi, toBase64Payload, toDataUrl } from "../lib/tauriApi";
import "./EditorWindow.css";

export function EditorWindow() {
  const canvasRef = useRef<CanvasHandle>(null);
  const loadImage = useDocumentStore((s) => s.loadImage);
  const undo = useDocumentStore((s) => s.undo);
  const redo = useDocumentStore((s) => s.redo);
  const toast = useToastStore((s) => s.message);
  const showToast = useToastStore((s) => s.show);
  const clearToast = useToastStore((s) => s.clear);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    const loadFromBase64 = (base64: string) => {
      const img = new Image();
      img.onload = () => loadImage(toDataUrl(base64), img.width, img.height);
      img.src = toDataUrl(base64);
    };

    tauriApi.takePendingImage().then((pending) => {
      if (pending) loadFromBase64(pending);
    });

    const unlisten = listen<string>("shota://new-capture", (event) => loadFromBase64(event.payload));
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [loadImage]);

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
    getCurrentWindow().close();
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
        getCurrentWindow().close();
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
