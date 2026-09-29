import { useEffect, useState } from "react";
import { Minus, SquareRoundCorner, TypeOutline, Droplet, Grid3x3 } from "lucide-react";
import { ColorOption, OptionDropdown, Slider, SliderOption } from "./OptionControls";
import { FillMode, StrokeStyle } from "../types";
import { useSystemFonts } from "../fonts";
import { useStyleTarget } from "./useStyleTarget";
import { useUiStore } from "../../../stores/uiStore";
import "./ShapeOptionsPanel.css";

/** Highlighter inks, borrowed from the Stabilo Boss range. The general
 * swatches are picked for ink-on-paper contrast, which is the wrong job
 * here — a marker's colour has to survive being multiplied down to ~45%
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

/**
 * Style controls for the active drawing tool or the currently selected
 * shape, each living inline in the toolbar as its own small pill — click one
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
  const { style, updateStyle, showStroke, showFill, showCornerRadius, showFontSize, showBlur, showSpotlight, showHighlight } = target;
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
 * the dropdown trigger — doesn't mirror the currently selected style like
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
