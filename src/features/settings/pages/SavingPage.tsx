import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { ImageFormat } from "../../../lib/tauriApi";
import { t } from "../../../lib/i18n";
import { FILE_NAME_TOKENS, formatFileName } from "../../../lib/fileName";
import { usePreferencesStore } from "../../../stores/preferencesStore";
import { Segmented, SettingsPage, SettingsRow, SettingsSection } from "../SettingsLayout";
import "./SavingPage.css";

const FORMATS: { value: ImageFormat; label: string }[] = [
  { value: "png", label: "PNG" },
  { value: "jpeg", label: "JPG" },
  { value: "webp", label: "WebP" },
];

const EXTENSIONS: Record<ImageFormat, string> = { png: "png", jpeg: "jpg", webp: "webp" };

/** A typical capture, so the preview shows real-looking numbers. */
const PREVIEW_SIZE = { width: 1920, height: 1080 };

export function SavingPage() {
  const preferences = usePreferencesStore((s) => s.preferences);
  const update = usePreferencesStore((s) => s.update);
  // The pattern is edited locally and saved on blur or Enter: saving on
  // every keystroke would emit a settings event to every window per letter.
  const [pattern, setPattern] = useState(preferences?.fileNamePattern ?? "");
  const [quality, setQuality] = useState(preferences?.imageQuality ?? 90);

  useEffect(() => {
    if (preferences) {
      setPattern(preferences.fileNamePattern);
      setQuality(preferences.imageQuality);
    }
  }, [preferences?.fileNamePattern, preferences?.imageQuality]);

  if (!preferences) return null;

  const commitPattern = () => {
    const next = pattern.trim();
    if (next && next !== preferences.fileNamePattern) update({ fileNamePattern: next });
    else setPattern(preferences.fileNamePattern);
  };

  const insertToken = (token: string) => {
    const next = `${pattern}${pattern.endsWith(" ") || !pattern ? "" : " "}${token}`;
    setPattern(next);
    update({ fileNamePattern: next });
  };

  const chooseFolder = async () => {
    const picked = await open({ directory: true, defaultPath: preferences.saveDir ?? undefined });
    if (typeof picked === "string") update({ saveDir: picked });
  };

  const preview = `${formatFileName(pattern || preferences.fileNamePattern, new Date(), PREVIEW_SIZE)}.${EXTENSIONS[preferences.imageFormat]}`;

  return (
    <SettingsPage title={t("settings.saving")}>
      <SettingsSection>
        <SettingsRow
          label={t("settings.saveFolder")}
          hint={preferences.saveDir ?? t("settings.saveFolderLast")}
        >
          {preferences.saveDir && (
            <button type="button" className="settings-control" onClick={() => update({ saveDir: null })}>
              {t("settings.saveFolderReset")}
            </button>
          )}
          <button type="button" className="settings-control" onClick={chooseFolder}>
            {t("settings.saveFolderChoose")}
          </button>
        </SettingsRow>

        <SettingsRow
          label={t("settings.fileName")}
          hint={t("settings.fileNamePreview", { name: preview })}
          below={
            <div className="saving-page__pattern">
              <input
                className="settings-control saving-page__input"
                value={pattern}
                spellCheck={false}
                onChange={(e) => setPattern(e.target.value)}
                onBlur={commitPattern}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
              />
              <div className="saving-page__tokens">
                {FILE_NAME_TOKENS.map((token) => (
                  <button
                    key={token}
                    type="button"
                    className="saving-page__token"
                    // Keep focus in the field, so its blur doesn't save the
                    // half-typed pattern before the token is appended.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => insertToken(token)}
                  >
                    {token}
                  </button>
                ))}
              </div>
            </div>
          }
        />
      </SettingsSection>

      <SettingsSection title={t("settings.formatSection")}>
        <SettingsRow label={t("settings.format")} hint={t("settings.formatHint")}>
          <Segmented value={preferences.imageFormat} options={FORMATS} onChange={(imageFormat) => update({ imageFormat })} />
        </SettingsRow>
        {preferences.imageFormat !== "png" && (
          <SettingsRow label={t("settings.quality")} hint={t("settings.qualityHint")}>
            <input
              type="range"
              min={10}
              max={100}
              step={5}
              value={quality}
              className="saving-page__quality"
              onChange={(e) => setQuality(Number(e.target.value))}
              // Saved when the drag ends, not on every step of it.
              onPointerUp={() => update({ imageQuality: quality })}
              onKeyUp={() => update({ imageQuality: quality })}
            />
            <span className="saving-page__quality-value">{quality}</span>
          </SettingsRow>
        )}
      </SettingsSection>
    </SettingsPage>
  );
}
