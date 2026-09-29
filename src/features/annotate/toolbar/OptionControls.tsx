import { ReactNode } from "react";
import { Dropdown } from "../../../components/Dropdown";
import "./ShapeOptionsPanel.css";

/**
 * The generic pieces every style control in the toolbar is built from.
 *
 * These lived inline in ShapeOptionsPanel, which meant each new control was
 * written out longhand: six sliders that differed only in id, icon and
 * range, and two colour+strength pickers (spotlight and highlighter) that
 * were the same twenty-five lines with one word changed. Adding a tool's
 * options is now a few lines per control, and a change to how a slider or
 * palette behaves lands in one place instead of six.
 */

export const SWATCHES = [
  "#111111",
  "#ff3b30",
  "#ff9500",
  "#ffcc00",
  "#34c759",
  "#2dd4bf",
  "#3d7bfd",
  "#af52de",
  "#ff2d78",
  "#ffffff",
];

/** Adapts the shared `Dropdown`'s controlled open/close to this panel's "only one menu open at a time" id-based state, so call sites below don't each need their own open-state wiring. */
export function OptionDropdown({
  id,
  openMenu,
  setOpenMenu,
  ...rest
}: {
  id: string;
  openMenu: string | null;
  setOpenMenu: (id: string | null) => void;
} & Omit<Parameters<typeof Dropdown>[0], "open" | "onToggle" | "onClose">) {
  const open = openMenu === id;
  return <Dropdown open={open} onToggle={() => setOpenMenu(open ? null : id)} onClose={() => setOpenMenu(null)} {...rest} />;
}

/** The two props every control below needs to cooperate with the
 * one-menu-open-at-a-time behaviour, bundled so each call site can spread
 * them rather than repeat the pair. */
export interface MenuProps {
  openMenu: string | null;
  setOpenMenu: (id: string | null) => void;
}

/**
 * A pill that opens a single slider. Six of these were written out
 * longhand (stroke width, corner radius, font size, spotlight radius,
 * highlighter thickness, and the blur intensity that still lives inline
 * with its effect toggle) — identical but for the id, icon and range.
 */
export function SliderOption({
  id,
  trigger,
  min,
  max,
  step,
  value,
  onChange,
  openMenu,
  setOpenMenu,
}: MenuProps & {
  id: string;
  trigger: ReactNode;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <OptionDropdown id={id} openMenu={openMenu} setOpenMenu={setOpenMenu} trigger={trigger}>
      <div className="shape-options__menu">
        <Slider min={min} max={max} step={step} value={value} onChange={onChange} />
      </div>
    </OptionDropdown>
  );
}

/**
 * A colour dot that opens a palette, optionally with a strength slider
 * under it — the spotlight and highlighter both need exactly that pairing,
 * and had it written out twice, identically, differing in one word.
 */
export function ColorOption({
  id,
  color,
  onPickColor,
  swatches,
  opacity,
  onChangeOpacity,
  openMenu,
  setOpenMenu,
}: MenuProps & {
  id: string;
  color: string;
  onPickColor: (color: string) => void;
  swatches?: string[];
  /** Omit both to render the palette on its own. */
  opacity?: number;
  onChangeOpacity?: (opacity: number) => void;
}) {
  const palette = <ColorPalette value={color} onPick={onPickColor} swatches={swatches} />;
  return (
    <OptionDropdown id={id} openMenu={openMenu} setOpenMenu={setOpenMenu} trigger={<ColorSwatch color={color} />}>
      {opacity === undefined || !onChangeOpacity ? (
        palette
      ) : (
        <div className="shape-options__menu shape-options__menu--list">
          {palette}
          <Slider min={0.1} max={1} step={0.05} value={opacity} onChange={onChangeOpacity} />
        </div>
      )}
    </OptionDropdown>
  );
}

/** `<input type="range">` with the string/number conversion done once. */
export function Slider({
  min,
  max,
  step,
  value,
  onChange,
}: {
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  );
}

export function ColorSwatch({ color }: { color: string }) {
  return <span className="shape-options__color-dot" style={{ background: color }} />;
}

export function ColorPalette({
  value,
  onPick,
  swatches = SWATCHES,
}: {
  value: string;
  onPick: (color: string) => void;
  swatches?: string[];
}) {
  return (
    <div className="shape-options__palette">
      {swatches.map((c) => (
        <button
          key={c}
          type="button"
          className="shape-options__swatch"
          style={value === c ? { background: c, boxShadow: `0 0 0 2px #ffffff, 0 0 0 4px ${c}` } : { background: c }}
          onClick={() => onPick(c)}
        />
      ))}
      <label className="shape-options__custom" title="Custom color">
        <input type="color" value={value} onChange={(e) => onPick(e.target.value)} />
      </label>
    </div>
  );
}
