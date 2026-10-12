import { useEffect, useMemo, useRef, useState } from "react";
import { usePreferencesStore } from "../../stores/preferencesStore";
import { open } from "@tauri-apps/plugin-dialog";
import { ChevronDown, ChevronUp, Plus } from "lucide-react";
import { useDocumentStore } from "../../stores/documentStore";
import { useImage } from "../../lib/useImage";
import { t } from "../../lib/i18n";
import { Frame, FrameBackground, lastSliders, rememberSliders } from "./frame";
import { ALL_GRADIENTS, FEATURED_GRADIENTS, gradientCss } from "./gradients";
import { blurredCopy, loadBackgroundImage } from "./useFrameBackground";
import "./BackgroundPanel.css";

/** Neutrals first, then a spectrum in two rows: saturated, then soft. */
const COLORS = [
  "transparent", "#ffffff", "#e4e4e7", "#71717a", "#18181b",
  "#ef4444", "#f97316", "#f59e0b", "#22c55e", "#3b82f6", "#8b5cf6", "#ec4899",
  "#fecaca", "#fed7aa", "#fde68a", "#bbf7d0", "#bfdbfe", "#ddd6fe", "#fbcfe8",
];

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "bmp", "gif"];

function sameBackground(a: FrameBackground | undefined, b: FrameBackground): boolean {
  if (!a || a.kind !== b.kind) return false;
  switch (b.kind) {
    case "gradient":
      return (a as typeof b).id === b.id;
    case "color":
      return (a as typeof b).color === b.color;
    case "image":
      return (a as typeof b).path === b.path;
    default:
      return true;
  }
}

/**
 * The frame panel: pick what goes behind the screenshot, then adjust the
 * padding, corners and shadow around it.
 *
 * Choosing a background is what turns the frame on; "Reset" turns it off.
 * The sliders start from wherever they were left last time, so a look you
 * settled on carries over to the next capture with one click.
 */
export function BackgroundPanel() {
  const frame = useDocumentStore((s) => s.frame);
  const setFrame = useDocumentStore((s) => s.setFrame);
  const image = useDocumentStore((s) => s.image);
  const imageElement = useImage(image);
  const [wallpaperUrl, setWallpaperUrl] = useState<string | null>(null);
  const [customPath, setCustomPath] = useState<string | null>(
    frame?.background.kind === "image" ? frame.background.path : null,
  );
  const [customUrl, setCustomUrl] = useState<string | null>(null);
  // Opens expanded when the frame already uses a gradient from beyond the
  // featured set, so the selected swatch is never hidden.
  const [showAllGradients, setShowAllGradients] = useState(
    frame?.background.kind === "gradient" &&
      !FEATURED_GRADIENTS.some((g) => g.id === (frame.background as { id: string }).id),
  );

  useEffect(() => {
    loadBackgroundImage({ kind: "wallpaper" })
      ?.then((img) => setWallpaperUrl(img.src))
      .catch(() => setWallpaperUrl(null));
  }, []);

  useEffect(() => {
    if (!customPath) return setCustomUrl(null);
    loadBackgroundImage({ kind: "image", path: customPath })
      ?.then((img) => setCustomUrl(img.src))
      .catch(() => setCustomUrl(null));
  }, [customPath]);

  const blurredUrl = useMemo(
    () => (imageElement ? blurredCopy(imageElement).toDataURL("image/jpeg", 0.8) : null),
    [imageElement],
  );

  // Remembered for new captures, but only on what the user does here ~
  // reopening an old capture with a different frame must not change what
  // the next capture gets. Debounced, because a slider drag is dozens of
  // changes and each save is written to disk and broadcast to every window.
  const updatePreferences = usePreferencesStore((s) => s.update);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remember = (next: Frame | null) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => updatePreferences({ frame: next }), 300);
  };
  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

  const apply = (next: Frame | null) => {
    setFrame(next);
    remember(next);
  };

  const choose = (background: FrameBackground) => {
    const sliders = frame ?? lastSliders();
    apply({ background, padding: sliders.padding, corners: sliders.corners, shadow: sliders.shadow });
  };

  const adjust = (change: Partial<Frame>) => {
    if (frame) apply({ ...frame, ...change });
  };

  const chooseImage = async () => {
    const picked = await open({ filters: [{ name: "Images", extensions: IMAGE_EXTENSIONS }] });
    if (typeof picked !== "string") return;
    setCustomPath(picked);
    choose({ kind: "image", path: picked });
  };

  const tile = (background: FrameBackground, content: React.ReactNode, label: string, extraClass = "") => (
    <button
      key={JSON.stringify(background)}
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={sameBackground(frame?.background, background)}
      className={`background-panel__tile ${extraClass}${sameBackground(frame?.background, background) ? " background-panel__tile--active" : ""}`}
      onClick={() => choose(background)}
    >
      {content}
    </button>
  );

  const slider = (key: "padding" | "corners" | "shadow", label: string) => (
    <label className="background-panel__slider">
      <span>{label}</span>
      <input
        type="range"
        min={0}
        max={100}
        value={frame?.[key] ?? lastSliders()[key]}
        disabled={!frame}
        onChange={(e) => adjust({ [key]: Number(e.target.value) })}
        onPointerUp={() => frame && rememberSliders(frame)}
        onKeyUp={() => frame && rememberSliders(frame)}
      />
    </label>
  );

  return (
    <aside className="background-panel">
      <section className="background-panel__section">
        <div className="background-panel__heading">
          <h3>{t("background.gradients")}</h3>
          <button
            type="button"
            className="background-panel__more"
            aria-expanded={showAllGradients}
            onClick={() => setShowAllGradients((v) => !v)}
          >
            {showAllGradients ? t("background.showLess") : t("background.showAll")}
            {showAllGradients ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        </div>
        <div className="background-panel__grid">
          {(showAllGradients ? ALL_GRADIENTS : FEATURED_GRADIENTS).map((gradient) =>
            tile(
              { kind: "gradient", id: gradient.id },
              <span className="background-panel__swatch" style={{ background: gradientCss(gradient) }} />,
              gradient.name,
            ),
          )}
        </div>
      </section>

      <section className="background-panel__section">
        <h3>{t("background.images")}</h3>
        <div className="background-panel__grid">
          {wallpaperUrl && tile({ kind: "wallpaper" }, <img src={wallpaperUrl} alt="" />, t("background.wallpaper"))}
          {blurredUrl && tile({ kind: "blurred" }, <img src={blurredUrl} alt="" />, t("background.blurred"))}
          {customPath && customUrl && tile({ kind: "image", path: customPath }, <img src={customUrl} alt="" />, customPath)}
          <button
            type="button"
            className="background-panel__tile background-panel__tile--add"
            title={t("background.chooseImage")}
            aria-label={t("background.chooseImage")}
            onClick={chooseImage}
          >
            <Plus size={16} />
          </button>
        </div>
      </section>

      <section className="background-panel__section">
        <h3>{t("background.colors")}</h3>
        <div className="background-panel__colors">
          {COLORS.map((color) =>
            tile(
              { kind: "color", color },
              <span style={color === "transparent" ? undefined : { background: color }} />,
              color === "transparent" ? t("background.transparent") : color,
              `background-panel__color${color === "transparent" ? " background-panel__color--transparent" : ""}`,
            ),
          )}
        </div>
      </section>

      <section className="background-panel__section background-panel__sliders">
        {slider("padding", t("background.padding"))}
        {slider("corners", t("background.corners"))}
        {slider("shadow", t("background.shadow"))}
      </section>

      <button type="button" className="background-panel__reset" disabled={!frame} onClick={() => apply(null)}>
        {t("background.reset")}
      </button>
    </aside>
  );
}
