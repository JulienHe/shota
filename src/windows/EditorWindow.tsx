import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";

import { Toolbar } from "../features/annotate/toolbar/Toolbar";
import { StylePanel } from "../features/annotate/toolbar/StylePanel";
import { Canvas, CanvasHandle } from "../features/annotate/Canvas";
import { useDocumentStore } from "../stores/documentStore";
import { useToolStore } from "../stores/toolStore";
import { useKeyboardShortcut } from "../lib/useKeyboardShortcut";
import { tauriApi, toBase64Payload, toDataUrl } from "../lib/tauriApi";
import "./EditorWindow.css";

export function EditorWindow() {
  const canvasRef = useRef<CanvasHandle>(null);
  const loadImage = useDocumentStore((s) => s.loadImage);
  const activeTool = useToolStore((s) => s.activeTool);

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

  const handleCopy = async () => {
    const dataUrl = canvasRef.current?.exportDataUrl();
    if (!dataUrl) return;
    await tauriApi.copyImageToClipboard(toBase64Payload(dataUrl));
  };

  const handleSave = async () => {
    const dataUrl = canvasRef.current?.exportDataUrl();
    if (!dataUrl) return;
    const name = `shota-${new Date().toISOString().replace(/[:.]/g, "-")}.png`;
    await tauriApi.saveImageAs(toBase64Payload(dataUrl), name);
  };

  useKeyboardShortcut({ ctrl: true, key: "c" }, handleCopy, []);
  useKeyboardShortcut({ ctrl: true, key: "s" }, handleSave, []);

  return (
    <div className="editor-window">
      <Toolbar onCopy={handleCopy} onSave={handleSave} />
      <div className="editor-window__body">
        <Canvas ref={canvasRef} />
        <StylePanel activeTool={activeTool} />
      </div>
    </div>
  );
}
