import { useEffect, useState } from "react";
import { tauriApi } from "../../lib/tauriApi";
import { formatAccelerator } from "./formatAccelerator";
import "./ShortcutSettings.css";

export type ShortcutKind = "fullscreen" | "area";
export type Shortcuts = Record<ShortcutKind, string>;

const LABELS: Record<ShortcutKind, string> = {
  fullscreen: "Full screen",
  area: "Area / window",
};

interface ShortcutSettingsProps {
  shortcuts: Shortcuts;
  onChange: (shortcuts: Shortcuts) => void;
}

export function ShortcutSettings({ shortcuts, onChange }: ShortcutSettingsProps) {
  const [recording, setRecording] = useState<ShortcutKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!recording) return;

    const onKeyDown = async (e: KeyboardEvent) => {
      e.preventDefault();
      if (e.key === "Escape") {
        setRecording(null);
        return;
      }
      const accelerator = formatAccelerator(e);
      if (!accelerator) return;

      try {
        await tauriApi.setShortcut(recording, accelerator);
        onChange({ ...shortcuts, [recording]: accelerator });
        setError(null);
      } catch {
        setError("That combo couldn't be registered — try another.");
      } finally {
        setRecording(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [recording, shortcuts, onChange]);

  return (
    <div className="shortcut-settings">
      {(Object.keys(LABELS) as ShortcutKind[]).map((kind) => (
        <div key={kind} className="shortcut-settings__row">
          <span className="shortcut-settings__label">{LABELS[kind]}</span>
          {recording === kind ? (
            <span className="shortcut-settings__recording">Press keys… (Esc to cancel)</span>
          ) : (
            <button type="button" className="shortcut-settings__value" onClick={() => setRecording(kind)}>
              {shortcuts[kind]}
            </button>
          )}
        </div>
      ))}
      {error && <p className="shortcut-settings__error">{error}</p>}
    </div>
  );
}
