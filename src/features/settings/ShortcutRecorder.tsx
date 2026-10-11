import { useEffect, useRef } from "react";
import { RotateCcw } from "lucide-react";
import { tauriApi } from "../../lib/tauriApi";
import { eventToAccelerator, sameAccelerator } from "../../lib/accelerator";
import { t } from "../../lib/i18n";
import { Keys } from "./SettingsLayout";
import "./ShortcutRecorder.css";

interface ShortcutRecorderProps {
  value: string;
  defaultValue: string;
  /** Global shortcuts pause Shota's own hotkeys while recording. */
  global: boolean;
  recording: boolean;
  onRecordingChange: (recording: boolean) => void;
  onRecord: (accelerator: string) => void;
}

/**
 * A shortcut shown as keycaps; click it, press the new keys.
 *
 * Only one records at a time; the page owns which, so starting another
 * stops this one.
 */
export function ShortcutRecorder({
  value,
  defaultValue,
  global,
  recording,
  onRecordingChange,
  onRecord,
}: ShortcutRecorderProps) {
  // Through refs so a parent re-render (fresh closures) doesn't tear the
  // listeners down mid-recording and toggle the global pause off and on.
  const callbacks = useRef({ onRecordingChange, onRecord });
  callbacks.current = { onRecordingChange, onRecord };

  useEffect(() => {
    if (!recording) return;
    if (global) tauriApi.pauseGlobalShortcuts(true).catch(() => {});

    const finish = (accelerator: string | null) => {
      callbacks.current.onRecordingChange(false);
      if (accelerator) callbacks.current.onRecord(accelerator);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape" && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        finish(null);
        return;
      }
      // Print Screen arrives as keyup only: Windows never delivers its
      // keydown to the webview. Handled below.
      if (e.key === "PrintScreen") return;
      const accelerator = eventToAccelerator(e);
      if (accelerator) finish(accelerator);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key !== "PrintScreen") return;
      e.preventDefault();
      finish(eventToAccelerator(e));
    };
    // Clicking anywhere else, or leaving the window, cancels rather than
    // leaving a recorder armed to swallow the next key press.
    const cancel = () => finish(null);

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("blur", cancel);
    window.addEventListener("mousedown", cancel);
    return () => {
      window.removeEventListener("mousedown", cancel);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("blur", cancel);
      if (global) tauriApi.pauseGlobalShortcuts(false).catch(() => {});
    };
  }, [recording, global]);

  const isDefault = sameAccelerator(value, defaultValue);

  return (
    <span className="shortcut-recorder">
      {!isDefault && !recording && (
        <button
          type="button"
          className="shortcut-recorder__reset"
          title={t("settings.resetShortcut")}
          aria-label={t("settings.resetShortcut")}
          onClick={() => onRecord(defaultValue)}
        >
          <RotateCcw size={13} />
        </button>
      )}
      <button
        type="button"
        className={`shortcut-recorder__binding${recording ? " shortcut-recorder__binding--recording" : ""}`}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={() => onRecordingChange(!recording)}
      >
        {recording ? t("settings.recording") : <Keys accelerator={value} />}
      </button>
    </span>
  );
}
