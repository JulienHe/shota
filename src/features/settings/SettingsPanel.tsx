import { useEffect, useState } from "react";
import { tauriApi } from "../../lib/tauriApi";
import { formatAccelerator } from "./formatAccelerator";
import "./SettingsPanel.css";
import { t } from "../../lib/i18n";

export type ShortcutKind = "fullscreen" | "area";
export type Shortcuts = Record<ShortcutKind, string>;

const LABEL_KEYS: Record<ShortcutKind, string> = {
  fullscreen: "settings.fullScreen",
  area: "settings.areaWindow",
};

interface SettingsPanelProps {
  shortcuts: Shortcuts;
  onChange: (shortcuts: Shortcuts) => void;
}

/** Each language named in itself, which is what people scan for ~ a French
 * speaker looks for "Français", not for "French". */
const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  fr: "Français",
  de: "Deutsch",
  es: "Español",
  ja: "日本語",
  ko: "한국어",
  "zh-Hans": "简体中文",
  "zh-Hant": "繁體中文",
  "pt-BR": "Português (Brasil)",
  it: "Italiano",
  nl: "Nederlands",
  pl: "Polski",
  ru: "Русский",
  uk: "Українська",
  tr: "Türkçe",
};

export function SettingsPanel({ shortcuts, onChange }: SettingsPanelProps) {
  const [recording, setRecording] = useState<ShortcutKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [language, setLanguage] = useState<string | null>(null);
  const [locales, setLocales] = useState<string[]>([]);

  const [printScreenTaken, setPrintScreenTaken] = useState(false);

  useEffect(() => {
    tauriApi.supportedLocales().then(setLocales).catch(() => setLocales([]));
    tauriApi.getLanguage().then(setLanguage).catch(() => setLanguage(null));
    tauriApi
      .printScreenOwnedBySnippingTool()
      .then(setPrintScreenTaken)
      .catch(() => setPrintScreenTaken(false));
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
    <div className="settings-panel">
      {(Object.keys(LABEL_KEYS) as ShortcutKind[]).map((kind) => (
        <div key={kind} className="settings-panel__row">
          <span className="settings-panel__label">{t(LABEL_KEYS[kind])}</span>
          {recording === kind ? (
            <span className="settings-panel__recording">{t("settings.recording")}</span>
          ) : (
            <button type="button" className="settings-panel__value" onClick={() => setRecording(kind)}>
              {shortcuts[kind]}
            </button>
          )}
        </div>
      ))}
      {error && <p className="settings-panel__error">{error}</p>}

      {/* Windows 11 binds Print Screen to the Snipping Tool by default, which
          swallows Shota's capture shortcut with no error and no clue as to
          why. The toggle is a per-user registry value, so rather than telling
          someone to go hunting through Settings, offer to flip it. */}
      {printScreenTaken && (
        <div className="settings-panel__notice">
          <span>{t("settings.printScreenOwned")}</span>
          <button
            type="button"
            onClick={() => {
              tauriApi
                .releasePrintScreen()
                .then(() => setPrintScreenTaken(false))
                .catch((err) => console.error("could not release Print Screen", err));
            }}
          >
            {t("settings.printScreenFix")}
          </button>
        </div>
      )}

      <div className="settings-panel__row">
        <span className="settings-panel__label">{t("settings.language")}</span>
        <select
          className="settings-panel__value"
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
