import { useCallback, useEffect, useState } from "react";
import { ask } from "@tauri-apps/plugin-dialog";
import { HistoryUsage, tauriApi } from "../../../lib/tauriApi";
import { currentLocale, t } from "../../../lib/i18n";
import { usePreferencesStore } from "../../../stores/preferencesStore";
import { SettingsPage, SettingsRow, SettingsSection } from "../SettingsLayout";

const LIMITS = [10, 20, 50, 100, 500];
const AGES = [1, 7, 30, 90];

function formatBytes(bytes: number): string {
  const units = ["kilobyte", "megabyte", "gigabyte"] as const;
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return new Intl.NumberFormat(currentLocale(), {
    style: "unit",
    unit: units[unit],
    maximumFractionDigits: value < 10 ? 1 : 0,
  }).format(value);
}

export function HistoryPage() {
  const preferences = usePreferencesStore((s) => s.preferences);
  const update = usePreferencesStore((s) => s.update);
  const [usage, setUsage] = useState<HistoryUsage | null>(null);

  const refreshUsage = useCallback(() => {
    tauriApi.historyUsage().then(setUsage).catch(() => setUsage(null));
  }, []);

  useEffect(refreshUsage, [refreshUsage]);

  // Retention runs in the background after a change, so look again once it
  // has had a moment to delete what it's going to delete.
  useEffect(() => {
    const timer = setTimeout(refreshUsage, 600);
    return () => clearTimeout(timer);
  }, [preferences?.historyLimit, preferences?.historyMaxAgeDays, refreshUsage]);

  if (!preferences) return null;

  const clear = async () => {
    const confirmed = await ask(t("settings.clearHistoryConfirm"), {
      title: t("settings.clearHistory"),
      kind: "warning",
      okLabel: t("settings.clearHistory"),
      cancelLabel: t("editor.cropCancel"),
    });
    if (!confirmed) return;
    await tauriApi.clearHistory();
    refreshUsage();
  };

  const number = new Intl.NumberFormat(currentLocale());

  return (
    <SettingsPage title={t("settings.historyPage")}>
      <SettingsSection description={t("settings.historyIntro")}>
        <SettingsRow label={t("settings.historyLimit")}>
          <select
            className="settings-control"
            value={preferences.historyLimit ?? ""}
            onChange={(e) => update({ historyLimit: e.target.value ? Number(e.target.value) : null })}
          >
            {LIMITS.map((limit) => (
              <option key={limit} value={limit}>
                {t("settings.historyLimitValue", { count: number.format(limit) })}
              </option>
            ))}
            <option value="">{t("settings.historyUnlimited")}</option>
          </select>
        </SettingsRow>
        <SettingsRow label={t("settings.historyAge")}>
          <select
            className="settings-control"
            value={preferences.historyMaxAgeDays ?? ""}
            onChange={(e) => update({ historyMaxAgeDays: e.target.value ? Number(e.target.value) : null })}
          >
            <option value="">{t("settings.historyAgeNever")}</option>
            {AGES.map((days) => (
              <option key={days} value={days}>
                {t(days === 1 ? "settings.historyAgeDay" : "settings.historyAgeDays", { count: number.format(days) })}
              </option>
            ))}
          </select>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title={t("settings.storageSection")}>
        <SettingsRow
          label={t("settings.storageUsed")}
          hint={
            usage
              ? t("settings.storageValue", { count: number.format(usage.count), size: formatBytes(usage.bytes) })
              : undefined
          }
        >
          <button
            type="button"
            className="settings-control settings-control--danger"
            disabled={!usage || usage.count === 0}
            onClick={clear}
          >
            {t("settings.clearHistory")}
          </button>
        </SettingsRow>
      </SettingsSection>
    </SettingsPage>
  );
}
