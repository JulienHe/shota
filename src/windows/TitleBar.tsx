import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, Copy, X } from "lucide-react";
import { Toolbar } from "../features/annotate/toolbar/Toolbar";
import "./TitleBar.css";

/**
 * Replaces the native window title bar so the toolbar can live in the same
 * row as the window controls, CleanShot-style. `data-tauri-drag-region`
 * (deep mode) makes every bit of empty space in the bar draggable/
 * double-click-to-maximize while leaving buttons, the select, etc. fully
 * clickable — Tauri's drag script only intercepts a mousedown whose actual
 * target isn't itself a clickable element.
 */
export function TitleBar() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const win = getCurrentWindow();
    win.isMaximized().then(setMaximized);
    const unlisten = win.onResized(() => {
      win.isMaximized().then(setMaximized);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  return (
    <div className="title-bar" data-tauri-drag-region="deep">
      <div className="title-bar__toolbar">
        <Toolbar />
      </div>

      <div className="title-bar__window-controls">
        <button type="button" className="title-bar__control" title="Minimize" onClick={() => getCurrentWindow().minimize()}>
          <Minus size={16} strokeWidth={1.5} />
        </button>
        <button
          type="button"
          className="title-bar__control"
          title={maximized ? "Restore" : "Maximize"}
          onClick={() => getCurrentWindow().toggleMaximize()}
        >
          {maximized ? <Copy size={13} strokeWidth={1.5} /> : <Square size={13} strokeWidth={1.5} />}
        </button>
        <button
          type="button"
          className="title-bar__control title-bar__control--close"
          title="Close"
          onClick={() => getCurrentWindow().close()}
        >
          <X size={16} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}
