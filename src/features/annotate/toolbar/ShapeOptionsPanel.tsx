import { useEffect, useState } from "react";
import { Minus, SquareRoundCorner, TypeOutline, Droplet, Grid3x3, Plus, X } from "lucide-react";
import { ColorOption, OptionDropdown, Slider, SliderOption } from "./OptionControls";
import { ArrowHead, FillMode, ShapeStyle, StrokeStyle } from "../types";
import { useFavoritesStore, TextPresetStyle } from "../../../stores/favoritesStore";
import { t } from "../../../lib/i18n";
import { useSystemFonts } from "../fonts";
import { useStyleTarget } from "./useStyleTarget";
import { useUiStore } from "../../../stores/uiStore";
import "./ShapeOptionsPanel.css";

/** Highlighter inks, borrowed from the Stabilo Boss range. The general
 * swatches are picked for ink-on-paper contrast, which is the wrong job
 * here ~ a marker's colour has to survive being multiplied down to ~45%
 * over a white page, so these are the fluorescent, deliberately
 * over-saturated versions. */
const HIGHLIGHTER_SWATCHES = [
  "#fff32b", // yellow
  "#b5e61d", // green
  "#ff9b1a", // orange
  "#ff5fa2", // pink
  "#5ad2ff", // blue
  "#b98cff", // lilac
  "#5ce1c4", // mint
  "#ff6b57", // coral
];

const STROKE_STYLES: StrokeStyle[] = ["solid", "dashed", "dotted"];
const ARROW_HEADS: ArrowHead[] = ["filled", "outline", "double"];

/** Ready-made looks for text. They set size and outline and leave the font alone. */
const BUILTIN_TEXT_PRESETS: { id: string; label: string; patch: Partial<ShapeStyle> }[] = [
  { id: "plain", label: "textPreset.plain", patch: { fontSize: 28, textStrokeEnabled: false } },
  { id: "heading", label: "textPreset.heading", patch: { fontSize: 56, textStrokeEnabled: false } },
  { id: "caption", label: "textPreset.caption", patch: { fontSize: 18, textStrokeEnabled: false } },
  {
    id: "outlined",
    label: "textPreset.outlined",
    patch: { fontSize: 36, stroke: "#ffffff", textStrokeEnabled: true, textStrokeColor: "#000000" },
  },
];

/**
 * Style controls for the active drawing tool or the currently selected
 * shape, each living inline in the toolbar as its own small pill ~ click one
 * to reveal just that control (a color palette, a size slider, a font list,
 * …) in a dropdown below it, CleanShot-style, rather than showing every
 * slider at once or burying them all behind one shared icon. Only rendered
 * when one of those is actually relevant (a shape/text tool active, or a
 * shape selected).
 */
export function ShapeOptionsPanel() {
  const target = useStyleTarget();
  const systemFonts = useSystemFonts();
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const setStyleMenuOpen = useUiStore((s) => s.setStyleMenuOpen);

  // Tells the canvas to drop the selection handles while a value is being
  // adjusted. Gated on `target` too, so a menu left open when the selection
  // clears can't strand the handles in a hidden state.
  const menuOpen = target !== null && openMenu !== null;
  useEffect(() => {
    setStyleMenuOpen(menuOpen);
    return () => setStyleMenuOpen(false);
  }, [menuOpen, setStyleMenuOpen]);

  if (!target) return null;
  const { style, updateStyle, showStroke, showFill, showCornerRadius, showFontSize, showBlur, showSpotlight, showHighlight, showArrowHead, showTextPresets } = target;
  const closeMenu = () => setOpenMenu(null);
  const menu = { openMenu, setOpenMenu };

  return (
    <>
      <div className="toolbar__divider" />
      <div className="shape-options">
        {!showBlur && !showSpotlight && !showHighlight && (
          <ColorOption
            id="color"
            {...menu}
            color={style.stroke}
            onPickColor={(c) => updateStyle({ stroke: c, fillColor: c })}
          />
        )}

        {showHighlight && (
          <>
            <ColorOption
              id="highlightColor"
              {...menu}
              color={style.highlightColor}
              swatches={HIGHLIGHTER_SWATCHES}
              onPickColor={(c) => updateStyle({ highlightColor: c })}
              opacity={style.highlightOpacity}
              onChangeOpacity={(highlightOpacity) => updateStyle({ highlightOpacity })}
            />

            <SliderOption
              id="highlightWidth"
              {...menu}
              trigger={<Minus size={15} strokeWidth={2.5} />}
              min={6}
              max={64}
              step={2}
              value={style.highlightWidth}
              onChange={(highlightWidth) => updateStyle({ highlightWidth })}
            />
          </>
        )}

        {showSpotlight && (
          <>
            <ColorOption
              id="spotlightColor"
              {...menu}
              color={style.spotlightColor}
              onPickColor={(c) => updateStyle({ spotlightColor: c })}
              opacity={style.spotlightOpacity}
              onChangeOpacity={(spotlightOpacity) => updateStyle({ spotlightOpacity })}
            />

            <SliderOption
              id="spotlightRadius"
              {...menu}
              trigger={<SquareRoundCorner size={15} strokeWidth={2} />}
              min={0}
              max={48}
              step={2}
              value={style.spotlightRadius}
              onChange={(spotlightRadius) => updateStyle({ spotlightRadius })}
            />
          </>
        )}

        {showBlur && (
          <OptionDropdown
            id="blur"
            openMenu={openMenu}
            setOpenMenu={setOpenMenu}
            trigger={style.blurEffect === "blur" ? <Droplet size={15} strokeWidth={2} /> : <Grid3x3 size={15} strokeWidth={2} />}
          >
            <div className="shape-options__menu">
              <div className="shape-options__fill-group">
                <button
                  type="button"
                  className={`shape-options__outline-toggle${style.blurEffect === "blur" ? " shape-options__outline-toggle--active" : ""}`}
                  title="Blur"
                  onClick={() => updateStyle({ blurEffect: "blur" })}
                >
                  <Droplet size={15} strokeWidth={2} />
                </button>
                <button
                  type="button"
                  className={`shape-options__outline-toggle${style.blurEffect === "pixelate" ? " shape-options__outline-toggle--active" : ""}`}
                  title="Pixelate"
                  onClick={() => updateStyle({ blurEffect: "pixelate" })}
                >
                  <Grid3x3 size={15} strokeWidth={2} />
                </button>
              </div>
              <Slider
                min={2}
                max={40}
                step={1}
                value={style.blurIntensity}
                onChange={(blurIntensity) => updateStyle({ blurIntensity })}
              />
            </div>
          </OptionDropdown>
        )}

        {showStroke && (
          <>
            <SliderOption
              id="strokeWidth"
              {...menu}
              trigger={<Minus size={15} strokeWidth={2.5} />}
              min={1}
              max={24}
              step={1}
              value={style.strokeWidth}
              onChange={(strokeWidth) => updateStyle({ strokeWidth })}
            />

            <OptionDropdown id="lineStyle" openMenu={openMenu} setOpenMenu={setOpenMenu} trigger={<LineStyleIcon />}>
              <div className="shape-options__menu shape-options__menu--list">
                {STROKE_STYLES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`dropdown__menu-item${style.strokeStyle === s ? " dropdown__menu-item--active" : ""}`}
                    onClick={() => {
                      updateStyle({ strokeStyle: s });
                      closeMenu();
                    }}
                  >
                    <LinePreview strokeStyle={s} />
                    {s[0].toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
            </OptionDropdown>

            {showArrowHead && (
              <OptionDropdown
                id="arrowHead"
                openMenu={openMenu}
                setOpenMenu={setOpenMenu}
                trigger={<ArrowHeadPreview head={style.arrowHead ?? "filled"} />}
              >
                <div className="shape-options__menu shape-options__menu--list">
                  {ARROW_HEADS.map((head) => (
                    <button
                      key={head}
                      type="button"
                      className={`dropdown__menu-item${(style.arrowHead ?? "filled") === head ? " dropdown__menu-item--active" : ""}`}
                      onClick={() => {
                        updateStyle({ arrowHead: head });
                        closeMenu();
                      }}
                    >
                      <ArrowHeadPreview head={head} />
                      {t(`arrow.${head}`)}
                    </button>
                  ))}
                </div>
              </OptionDropdown>
            )}
          </>
        )}

        {showFill && (
          <OptionDropdown
            id="fill"
            openMenu={openMenu}
            setOpenMenu={setOpenMenu}
            trigger={<FillModeSwatch mode={style.fillMode} small />}
          >
            <div className="shape-options__menu shape-options__menu--list">
              <FillModeOption
                mode="none"
                active={style.fillMode === "none"}
                onClick={() => {
                  updateStyle({ fillMode: "none" });
                  closeMenu();
                }}
              />
              <FillModeOption
                mode="solid"
                active={style.fillMode === "solid"}
                onClick={() => {
                  updateStyle({ fillMode: "solid" });
                  closeMenu();
                }}
              />
              <FillModeOption
                mode="translucent"
                active={style.fillMode === "translucent"}
                onClick={() => updateStyle({ fillMode: "translucent" })}
              />
              {style.fillMode === "translucent" && (
                <Slider
                  min={0.05}
                  max={1}
                  step={0.05}
                  value={style.fillOpacity}
                  onChange={(fillOpacity) => updateStyle({ fillOpacity })}
                />
              )}
            </div>
          </OptionDropdown>
        )}

        {showCornerRadius && (
          <SliderOption
            id="corner"
            {...menu}
            trigger={<SquareRoundCorner size={15} strokeWidth={2} />}
            min={0}
            max={60}
            step={2}
            value={style.cornerRadius}
            onChange={(cornerRadius) => updateStyle({ cornerRadius })}
          />
        )}

        {showFontSize && (
          <>
            <SliderOption
              id="fontSize"
              {...menu}
              trigger={`${style.fontSize}px`}
              min={12}
              max={96}
              step={2}
              value={style.fontSize}
              onChange={(fontSize) => updateStyle({ fontSize })}
            />

            <OptionDropdown
              id="fontFamily"
              openMenu={openMenu}
              setOpenMenu={setOpenMenu}
              trigger={<span className="shape-options__font-trigger-label">{style.fontFamily}</span>}
            >
              <div className="shape-options__font-list">
                {systemFonts.map((name) => (
                  <button
                    key={name}
                    type="button"
                    className={`dropdown__menu-item${style.fontFamily === name ? " dropdown__menu-item--active" : ""}`}
                    style={{ fontFamily: name }}
                    onClick={() => {
                      updateStyle({ fontFamily: name });
                      closeMenu();
                    }}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </OptionDropdown>

            <button
              type="button"
              className={`shape-options__outline-toggle${style.textStrokeEnabled ? " shape-options__outline-toggle--active" : ""}`}
              title="Text outline"
              onClick={() => updateStyle({ textStrokeEnabled: !style.textStrokeEnabled })}
            >
              <TypeOutline size={15} strokeWidth={2} />
            </button>

            {style.textStrokeEnabled && (
              <ColorOption
                id="outlineColor"
                {...menu}
                color={style.textStrokeColor}
                onPickColor={(c) => updateStyle({ textStrokeColor: c, textStrokeEnabled: true })}
              />
            )}

            {showTextPresets && (
              <TextPresets
                style={style}
                updateStyle={updateStyle}
                openMenu={openMenu}
                setOpenMenu={setOpenMenu}
                closeMenu={closeMenu}
              />
            )}
          </>
        )}
      </div>
    </>
  );
}

function FillModeSwatch({ mode, small }: { mode: FillMode; small?: boolean }) {
  return (
    <span
      className={`shape-options__fill-swatch shape-options__fill-swatch--${mode}${small ? " shape-options__fill-swatch--sm" : ""}`}
    />
  );
}

function FillModeOption({ mode, active, onClick }: { mode: FillMode; active: boolean; onClick: () => void }) {
  const labels: Record<FillMode, string> = { none: "Stroke only", solid: "Filled", translucent: "Stroke + opacity" };
  return (
    <button type="button" className={`dropdown__menu-item${active ? " dropdown__menu-item--active" : ""}`} onClick={onClick}>
      <FillModeSwatch mode={mode} />
      {labels[mode]}
    </button>
  );
}

const STROKE_DASH: Record<StrokeStyle, string | undefined> = {
  solid: undefined,
  dashed: "5,3.5",
  dotted: "0.1,3.5",
};

/**
 * Fixed "line style" glyph (three stacked rows: solid, dashed, dotted) for
 * the dropdown trigger ~ doesn't mirror the currently selected style like
 * `LinePreview` does, because a plain solid line there looks identical to
 * the width pill's Minus icon right next to it and made the two impossible
 * to tell apart at a glance.
 */
function LineStyleIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" className="shape-options__line-preview">
      <line x1="1" y1="3" x2="14" y2="3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="butt" />
      <line x1="1" y1="7.5" x2="14" y2="7.5" stroke="currentColor" strokeWidth="1.6" strokeDasharray="3,2.2" strokeLinecap="butt" />
      <line x1="1" y1="12" x2="14" y2="12" stroke="currentColor" strokeWidth="1.6" strokeDasharray="0.1,3" strokeLinecap="round" />
    </svg>
  );
}

function LinePreview({ strokeStyle }: { strokeStyle: StrokeStyle }) {
  return (
    <svg width="20" height="10" viewBox="0 0 20 10" className="shape-options__line-preview">
      <line
        x1="1"
        y1="5"
        x2="19"
        y2="5"
        stroke="currentColor"
        strokeWidth="2"
        strokeDasharray={STROKE_DASH[strokeStyle]}
        strokeLinecap={strokeStyle === "dotted" ? "round" : "butt"}
      />
    </svg>
  );
}

/** A little arrow ending in the chosen head. */
function ArrowHeadPreview({ head }: { head: ArrowHead }) {
  const fill = head === "outline" ? "none" : "currentColor";
  return (
    <svg width="22" height="12" viewBox="0 0 22 12" className="shape-options__line-preview">
      <line x1={head === "double" ? 6 : 1} y1="6" x2="16" y2="6" stroke="currentColor" strokeWidth="1.8" />
      <polygon points="21,6 15,2.5 15,9.5" fill={fill} stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      {head === "double" && (
        <polygon points="1,6 7,2.5 7,9.5" fill={fill} stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      )}
    </svg>
  );
}

/** Text looks to start from: a few built in, and the ones the user saves. */
function TextPresets({
  style,
  updateStyle,
  openMenu,
  setOpenMenu,
  closeMenu,
}: {
  style: ShapeStyle;
  updateStyle: (patch: Partial<ShapeStyle>) => void;
  openMenu: string | null;
  setOpenMenu: (id: string | null) => void;
  closeMenu: () => void;
}) {
  const saved = useFavoritesStore((s) => s.textPresets);
  const addTextPreset = useFavoritesStore((s) => s.addTextPreset);
  const removeTextPreset = useFavoritesStore((s) => s.removeTextPreset);

  const current: TextPresetStyle = {
    stroke: style.stroke,
    fontSize: style.fontSize,
    fontFamily: style.fontFamily,
    textStrokeEnabled: style.textStrokeEnabled,
    textStrokeColor: style.textStrokeColor,
  };

  return (
    <OptionDropdown
      id="textPresets"
      openMenu={openMenu}
      setOpenMenu={setOpenMenu}
      trigger={<span className="shape-options__font-trigger-label">{t("textPreset.title")}</span>}
    >
      <div className="shape-options__menu shape-options__menu--list">
        {BUILTIN_TEXT_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className="dropdown__menu-item"
            onClick={() => {
              updateStyle(preset.patch);
              closeMenu();
            }}
          >
            <span className="shape-options__text-sample" style={{ fontSize: Math.min(22, Math.max(11, (preset.patch.fontSize ?? 28) / 2.4)) }}>
              Aa
            </span>
            {t(preset.label)}
          </button>
        ))}

        {saved.length > 0 && <div className="shape-options__menu-rule" />}
        {saved.map((preset, index) => (
          <div key={index} className="shape-options__preset-row">
            <button
              type="button"
              className="dropdown__menu-item shape-options__preset-apply"
              onClick={() => {
                updateStyle(preset);
                closeMenu();
              }}
            >
              <span
                className="shape-options__text-sample"
                style={{
                  color: preset.stroke,
                  fontFamily: preset.fontFamily,
                  fontSize: Math.min(22, Math.max(11, preset.fontSize / 2.4)),
                  WebkitTextStroke: preset.textStrokeEnabled ? `1px ${preset.textStrokeColor}` : undefined,
                  background: preset.stroke.toLowerCase() === "#ffffff" ? "#808080" : undefined,
                }}
              >
                Aa
              </span>
              {preset.fontSize}px
            </button>
            <button
              type="button"
              className="shape-options__preset-remove"
              title={t("textPreset.remove")}
              aria-label={t("textPreset.remove")}
              onClick={() => removeTextPreset(index)}
            >
              <X size={13} strokeWidth={2.2} />
            </button>
          </div>
        ))}

        <button type="button" className="dropdown__menu-item" onClick={() => addTextPreset(current)}>
          <Plus size={15} strokeWidth={2} />
          {t("textPreset.save")}
        </button>
      </div>
    </OptionDropdown>
  );
}
