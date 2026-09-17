import { Fullscreen, ScanLine } from "lucide-react";
import { tauriApi } from "../lib/tauriApi";
import "./MainWindow.css";

export function MainWindow() {
  return (
    <div className="main-window">
      <h1>shota</h1>
      <p className="main-window__subtitle">Screenshot &amp; annotate, without the subscription.</p>

      <div className="main-window__actions">
        <button type="button" onClick={() => tauriApi.captureFullscreenNow()}>
          <Fullscreen size={18} />
          Capture full screen
        </button>
        <button type="button" onClick={() => tauriApi.openCaptureOverlay()}>
          <ScanLine size={18} />
          Capture area / window
        </button>
      </div>

      <div className="main-window__shortcuts">
        <h2>Global shortcuts</h2>
        <ul>
          <li>
            <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>F</kbd> Full screen
          </li>
          <li>
            <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>A</kbd> Area selection (hold <kbd>Space</kbd> to snap to a window)
          </li>
        </ul>
        <h2>In the editor</h2>
        <ul>
          <li>
            <kbd>Ctrl</kbd>+<kbd>C</kbd> Copy to clipboard
          </li>
          <li>
            <kbd>Ctrl</kbd>+<kbd>S</kbd> Save as…
          </li>
        </ul>
      </div>
    </div>
  );
}
