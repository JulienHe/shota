import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ArrowUpRight } from "lucide-react";
import { tauriApi } from "../../../lib/tauriApi";
import { t } from "../../../lib/i18n";
import { SettingsPage, SettingsRow, SettingsSection } from "../SettingsLayout";
import "./AboutPage.css";

const REPO = "https://github.com/JulienHe/shota";

const LINKS = [
  { label: "settings.github", url: REPO },
  { label: "settings.reportIssue", url: `${REPO}/issues/new/choose` },
  { label: "settings.privacy", url: `${REPO}/blob/main/PRIVACY.md` },
  { label: "settings.support", url: `${REPO}/blob/main/FUNDING.md` },
];

export function AboutPage() {
  const [version, setVersion] = useState("");
  // Null until known, so the Store build never flashes a button it can't honour.
  const [canUpdate, setCanUpdate] = useState<boolean | null>(null);

  useEffect(() => {
    getVersion().then(setVersion).catch(() => {});
    tauriApi.updatesSupported().then(setCanUpdate).catch(() => setCanUpdate(false));
  }, []);

  return (
    <SettingsPage title={t("settings.about")}>
      <div className="about-page__hero">
        <img src="/logo.png" alt="" className="about-page__logo" />
        <div className="about-page__identity">
          <span className="about-page__name">Shota</span>
          <span className="about-page__tagline">{t("settings.tagline")}</span>
        </div>
      </div>

      <SettingsSection>
        {canUpdate !== null && (
          <SettingsRow
            label={t("settings.version", { version })}
            hint={canUpdate ? undefined : t("settings.storeUpdates")}
          >
            {canUpdate && (
              <button
                type="button"
                className="settings-control settings-control--primary"
                onClick={() => tauriApi.checkForUpdates()}
              >
                {t("settings.checkUpdates")}
              </button>
            )}
          </SettingsRow>
        )}
        {LINKS.map(({ label, url }) => (
          <button key={url} type="button" className="settings-row about-page__link" onClick={() => openUrl(url)}>
            <span className="settings-row__label">{t(label)}</span>
            <ArrowUpRight size={16} />
          </button>
        ))}
      </SettingsSection>

      <p className="about-page__license">{t("settings.license")}</p>
    </SettingsPage>
  );
}
