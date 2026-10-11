import { useEffect, useState } from "react";
import { tauriApi } from "../../../lib/tauriApi";
import { t } from "../../../lib/i18n";
import { SettingsPage, SettingsRow, SettingsSection } from "../SettingsLayout";

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

export function GeneralPage() {
  const [language, setLanguage] = useState<string | null>(null);
  const [locales, setLocales] = useState<string[]>([]);

  useEffect(() => {
    tauriApi.supportedLocales().then(setLocales).catch(() => setLocales([]));
    tauriApi.getLanguage().then(setLanguage).catch(() => setLanguage(null));
  }, []);

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
      </SettingsSection>
    </SettingsPage>
  );
}
