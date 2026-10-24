import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { tauriApi } from "../lib/tauriApi";
import { afterNextPaint, useTransparentWindow } from "../lib/windowChrome";
import { t } from "../lib/i18n";
import "./ScrollHud.css";

interface Progress {
  height: number;
  frames: number;
  phase: "waiting" | "scrolling" | "toofar" | "stitching";
}

/**
 * The panel shown while a scrolling capture runs: how far it has got, and
 * buttons to finish or cancel. Enter and Esc do the same from the keyboard
 * (Rust listens for them, since this window never has the focus).
 */
export function ScrollHud() {
  const [auto, setAuto] = useState(false);
  const [progress, setProgress] = useState<Progress>({ height: 0, frames: 1, phase: "waiting" });

  useTransparentWindow();
  useEffect(() => {
    afterNextPaint().then(() => tauriApi.showWithoutFocus());
  }, []);

  useEffect(() => {
    const unlisten = listen<Progress>("shota://scroll-progress", (event) => setProgress(event.payload));
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const message =
    progress.phase === "stitching"
      ? t("scroll.stitching")
      : progress.phase === "waiting"
        ? t("scroll.waiting")
        : progress.phase === "toofar"
          ? t("scroll.tooFar")
          : t("scroll.captured", { height: progress.height.toLocaleString() });

  return (
    <div className="scroll-hud">
      <div className="scroll-hud__text">
        <div className="scroll-hud__message">
          {progress.phase !== "stitching" && <span className="scroll-hud__dot" />}
          {message}
        </div>
        <div className="scroll-hud__hint">{t("scroll.keys")}</div>
      </div>
      <div className="scroll-hud__buttons">
        <button
          type="button"
          className={`scroll-hud__cancel${auto ? " scroll-hud__auto--on" : ""}`}
          title={t("scroll.autoHint")}
          onClick={() => {
            const next = !auto;
            setAuto(next);
            tauriApi.setScrollAuto(next);
          }}
        >
          {t("scroll.auto")}
        </button>
        <button type="button" className="scroll-hud__done" onClick={() => tauriApi.finishScrollCapture()}>
          {t("scroll.done")}
        </button>
        <button type="button" className="scroll-hud__cancel" onClick={() => tauriApi.cancelScrollCapture()}>
          {t("scroll.cancel")}
        </button>
      </div>
    </div>
  );
}
