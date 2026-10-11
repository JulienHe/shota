import { useEffect, useState } from "react";
import { tauriApi } from "../../../lib/tauriApi";
import { t } from "../../../lib/i18n";
import { formatAccelerator } from "../formatAccelerator";
import { Keys, SettingsPage, SettingsRow, SettingsSection } from "../SettingsLayout";
import "./ShortcutsPage.css";

export type ShortcutKind = "fullscreen" | "area";
export type Shortcuts = Record<ShortcutKind, string>;

const ROWS: { kind: ShortcutKind; label: string; hint?: string }[] = [
  { kind: "area", label: "settings.areaWindow", hint: "settings.areaHint" },
  { kind: "fullscreen", label: "settings.fullScreen" },
];

export function ShortcutsPage() {
  const [shortcuts, setShortcuts] = useState<Shortcuts | null>(null);
  const [historyShortcut, setHistoryShortcut] = useState("");
  const [recording, setRecording] = useState<ShortcutKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [printScreenTaken, setPrintScreenTaken] = useState(false);

  useEffect(() => {
    tauriApi.getShortcuts().then(setShortcuts);
    tauriApi.getHistoryShortcut().then(setHistoryShortcut).catch(() => {});
    tauriApi
      .printScreenOwnedBySnippingTool()
      .then(setPrintScreenTaken)
      .catch(() => setPrintScreenTaken(false));
  }, []);

  useEffect(() => {
    if (!recording || !shortcuts) return;

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
        setShortcuts({ ...shortcuts, [recording]: accelerator });
        setError(null);
      } catch {
        setError(t("settings.registerFailed"));
      } finally {
        setRecording(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [recording, shortcuts]);

  return (
    <SettingsPage title={t("settings.shortcuts")}>
      {/* Windows 11 binds Print Screen to the Snipping Tool by default, which
          swallows Shota's capture shortcut with no error and no clue as to
          why. The toggle is a per-user registry value, so rather than telling
          someone to go hunting through Windows Settings, offer to flip it. */}
      {printScreenTaken && (
        <div className="shortcuts-page__notice">
          <span>{t("settings.printScreenOwned")}</span>
          <button
            type="button"
            className="settings-control settings-control--primary"
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

      <SettingsSection title={t("settings.captureSection")} description={t("settings.shortcutsHint")}>
        {ROWS.map(({ kind, label, hint }) => (
          <SettingsRow key={kind} label={t(label)} hint={hint ? t(hint) : undefined}>
            <button
              type="button"
              className={`shortcuts-page__binding${recording === kind ? " shortcuts-page__binding--recording" : ""}`}
              onClick={() => setRecording(recording === kind ? null : kind)}
            >
              {recording === kind ? (
                t("settings.recording")
              ) : shortcuts ? (
                <Keys accelerator={shortcuts[kind]} />
              ) : null}
            </button>
          </SettingsRow>
        ))}
        <SettingsRow label={t("settings.history")} hint={t("settings.historyHint")}>
          <span className="shortcuts-page__fixed" title={t("settings.fixed")}>
            {historyShortcut && <Keys accelerator={historyShortcut} />}
          </span>
        </SettingsRow>
      </SettingsSection>

      {error && <p className="shortcuts-page__error">{error}</p>}
    </SettingsPage>
  );
}
