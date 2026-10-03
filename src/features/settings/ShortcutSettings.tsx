import { useEffect, useState } from "react";
import { tauriApi } from "../../lib/tauriApi";
import { formatAccelerator } from "./formatAccelerator";
import "./ShortcutSettings.css";
import { t } from "../../lib/i18n";

export type ShortcutKind = "fullscreen" | "area";
export type Shortcuts = Record<ShortcutKind, string>;

const LABEL_KEYS: Record<ShortcutKind, string> = {
  fullscreen: "settings.fullScreen",
  area: "settings.areaWindow",
};

interface ShortcutSettingsProps {
  shortcuts: Shortcuts;
  onChange: (shortcuts: Shortcuts) => void;
}

/** Each language named in itself, which is what people scan for — a French
 * speaker looks for "Français", not for "French". */
const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  fr: "Français",
  de: "Deutsch",
  es: "Español",
  ja: "日本語",
  ko: "한국어",
  "zh-Hans": "简体中文",
};

export function ShortcutSettings({ shortcuts, onChange }: ShortcutSettingsProps) {
  const [recording, setRecording] = useState<ShortcutKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [language, setLanguage] = useState<string | null>(null);
  const [locales, setLocales] = useState<string[]>([]);

  useEffect(() => {
    tauriApi.supportedLocales().then(setLocales).catch(() => setLocales([]));
    tauriApi.getLanguage().then(setLanguage).catch(() => setLanguage(null));
  }, []);

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
        setError(t("settings.registerFailed"));
      } finally {
        setRecording(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [recording, shortcuts, onChange]);

  return (
    <div className="shortcut-settings">
      {(Object.keys(LABEL_KEYS) as ShortcutKind[]).map((kind) => (
        <div key={kind} className="shortcut-settings__row">
          <span className="shortcut-settings__label">{t(LABEL_KEYS[kind])}</span>
          {recording === kind ? (
            <span className="shortcut-settings__recording">{t("settings.recording")}</span>
          ) : (
            <button type="button" className="shortcut-settings__value" onClick={() => setRecording(kind)}>
              {shortcuts[kind]}
            </button>
          )}
        </div>
      ))}
      {error && <p className="shortcut-settings__error">{error}</p>}

      <div className="shortcut-settings__row">
        <span className="shortcut-settings__label">{t("settings.language")}</span>
        <select
          className="shortcut-settings__value"
          value={language ?? ""}
          onChange={(e) => {
            const next = e.target.value || null;
            setLanguage(next);
            // Reloading is the honest way to apply this: the tray menu is
            // built once in Rust and the other windows are long-lived and
            // reused, so re-rendering this one view would leave most of the
            // app in the previous language.
            tauriApi.setLanguage(next).then(() => window.location.reload());
          }}
        >
          <option value="">{t("settings.languageSystem")}</option>
          {locales.map((tag) => (
            <option key={tag} value={tag}>
              {LANGUAGE_NAMES[tag] ?? tag}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
