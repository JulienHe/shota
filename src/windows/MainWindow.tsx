import { useEffect, useState } from "react";
import { Fullscreen, ScanLine, Settings } from "lucide-react";
import { tauriApi } from "../lib/tauriApi";
import { IconButton } from "../components/IconButton";
import { ShortcutSettings, Shortcuts } from "../features/settings/ShortcutSettings";
import "./MainWindow.css";
import { t } from "../lib/i18n";

export function MainWindow() {
  const [shortcuts, setShortcuts] = useState<Shortcuts | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    tauriApi.getShortcuts().then(setShortcuts);
  }, []);

  return (
    <div className="main-window">
      <div className="main-window__header">
        <div className="main-window__brand">
          <img src="/logo.png" alt="" className="main-window__logo" />
          Shota
        </div>
        <IconButton icon={Settings} label={t("main.shortcutsButton")} active={settingsOpen} onClick={() => setSettingsOpen((o) => !o)} />
      </div>

      {settingsOpen && shortcuts ? (
        <ShortcutSettings shortcuts={shortcuts} onChange={setShortcuts} />
      ) : (
        <>
          <div className="main-window__actions">
            <button type="button" className="main-window__action" onClick={() => tauriApi.captureFullscreenNow()}>
              <Fullscreen size={22} />
              <span>{t("main.fullScreen")}</span>
              <kbd>{shortcuts?.fullscreen ?? ""}</kbd>
            </button>
            <button type="button" className="main-window__action" onClick={() => tauriApi.openCaptureOverlay()}>
              <ScanLine size={22} />
              <span>{t("main.areaWindow")}</span>
              <kbd>{shortcuts?.area ?? ""}</kbd>
            </button>
          </div>

          <p className="main-window__hint">{t("main.snapHint")}</p>
        </>
      )}
    </div>
  );
}
