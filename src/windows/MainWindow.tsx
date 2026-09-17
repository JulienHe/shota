import { Fullscreen, ScanLine } from "lucide-react";
import { tauriApi } from "../lib/tauriApi";
import "./MainWindow.css";

export function MainWindow() {
  return (
    <div className="main-window">
      <div className="main-window__brand">shota</div>

      <div className="main-window__actions">
        <button type="button" className="main-window__action" onClick={() => tauriApi.captureFullscreenNow()}>
          <Fullscreen size={22} />
          <span>Full screen</span>
          <kbd>Ctrl Alt F</kbd>
        </button>
        <button type="button" className="main-window__action" onClick={() => tauriApi.openCaptureOverlay()}>
          <ScanLine size={22} />
          <span>Area / window</span>
          <kbd>Ctrl Alt A</kbd>
        </button>
      </div>

      <p className="main-window__hint">Hold Space while selecting an area to snap to a window.</p>
    </div>
  );
}
