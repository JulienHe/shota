import { useEffect, useState } from "react";
import { StartupStatus, ThemePreference, tauriApi } from "../../../lib/tauriApi";
import { t } from "../../../lib/i18n";
import { usePreferencesStore } from "../../../stores/preferencesStore";
import { SettingsPage, SettingsRow, SettingsSection, Toggle } from "../SettingsLayout";
import "./GeneralPage.css";

/** Each language named in itself, which is what people scan for ~ a French
 * speaker looks for "Français", not for "French". */
const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  fr: "Français",
  de: "Deutsch",
  es: "Español",
  it: "Italiano",
  "pt-BR": "Português (Brasil)",
  nl: "Nederlands",
  pl: "Polski",
  tr: "Türkçe",
  ru: "Русский",
  uk: "Українська",
  ja: "日本語",
  ko: "한국어",
  "zh-Hans": "简体中文",
  "zh-Hant": "繁體中文",
};

const THEMES: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "settings.themeSystem" },
  { value: "light", label: "settings.themeLight" },
  { value: "dark", label: "settings.themeDark" },
];

export function GeneralPage() {
  const [language, setLanguage] = useState<string | null>(null);
  const [locales, setLocales] = useState<string[]>([]);
  const [startup, setStartup] = useState<StartupStatus | null>(null);
  const [startupError, setStartupError] = useState(false);
  const [storeInstall, setStoreInstall] = useState<boolean | null>(null);
  const preferences = usePreferencesStore((s) => s.preferences);
  const update = usePreferencesStore((s) => s.update);

  useEffect(() => {
    tauriApi.supportedLocales().then(setLocales).catch(() => setLocales([]));
    tauriApi.getLanguage().then(setLanguage).catch(() => setLanguage(null));
    tauriApi.getLaunchAtStartup().then(setStartup).catch(() => setStartup(null));
    tauriApi.isStoreInstall().then(setStoreInstall).catch(() => setStoreInstall(null));
  }, []);

  const startupHint = startup?.blocked === "byUser"
    ? t("settings.startupBlockedByUser")
    : startup?.blocked === "byPolicy"
      ? t("settings.startupBlockedByPolicy")
      : t("settings.startupHint");

  return (
    <SettingsPage title={t("settings.general")}>
      <SettingsSection>
        <SettingsRow label={t("settings.language")} hint={t("settings.languageHint")}>
          <select
            className="settings-control"
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
        </SettingsRow>

        <SettingsRow
          label={t("settings.startup")}
          hint={startupHint}
          error={startupError ? t("settings.startupFailed") : null}
        >
          <Toggle
            label={t("settings.startup")}
            checked={startup?.enabled ?? false}
            disabled={!startup || startup.blocked === "byPolicy"}
            onChange={(enabled) => {
              setStartupError(false);
              tauriApi
                .setLaunchAtStartup(enabled)
                .then(setStartup)
                .catch((err) => {
                  console.error("launch at startup failed", err);
                  setStartupError(true);
                });
            }}
          />
        </SettingsRow>

        {/* The Store build declares the menu in its manifest, where it can't
            be switched off, so there's nothing to offer there. */}
        {preferences && storeInstall === false && (
          <SettingsRow label={t("settings.explorerMenu")} hint={t("settings.explorerMenuHint")}>
            <Toggle
              label={t("settings.explorerMenu")}
              checked={preferences.explorerMenu}
              onChange={(explorerMenu) => update({ explorerMenu })}
            />
          </SettingsRow>
        )}
      </SettingsSection>

      {preferences && (
        <SettingsSection title={t("settings.theme")} description={t("settings.themeHint")}>
          <div className="general-page__themes" role="radiogroup">
            {THEMES.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={preferences.theme === value}
                className={`general-page__theme${preferences.theme === value ? " general-page__theme--active" : ""}`}
                onClick={() => update({ theme: value })}
              >
                <span className={`general-page__preview general-page__preview--${value}`} aria-hidden>
                  <span className="general-page__preview-bar" />
                  <span className="general-page__preview-canvas" />
                </span>
                <span className="general-page__theme-label">{t(label)}</span>
              </button>
            ))}
          </div>
        </SettingsSection>
      )}
    </SettingsPage>
  );
}
