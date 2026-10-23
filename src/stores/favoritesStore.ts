import { create } from "zustand";
import { ShapeStyle } from "../features/annotate/types";

/**
 * Small lists the user builds up while editing and wants back next time:
 * favourite colours, and text styles. Kept in browser storage, which is
 * enough for a per-machine convenience; everything here works without it
 * (an empty list) if storage is unavailable.
 */

const COLORS_KEY = "shota.favoriteColors";
const TEXT_PRESETS_KEY = "shota.textPresets";
const MAX_COLORS = 12;
const MAX_TEXT_PRESETS = 6;

/** The part of a text style a preset stores. */
export type TextPresetStyle = Pick<
  ShapeStyle,
  "stroke" | "fontSize" | "fontFamily" | "textStrokeEnabled" | "textStrokeColor"
>;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch {
    // Storage unavailable or corrupt: start empty.
  }
  return fallback;
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Not remembered; still works for this session.
  }
}

/** `#RRGGBB`, lowercase, so "#FF0000" and "#ff0000" are one colour. */
export function normaliseColor(color: string): string {
  return color.trim().toLowerCase();
}

/** Adds `color` to the front of `list`, once, keeping at most `max`. */
export function withColor(list: string[], color: string, max = MAX_COLORS): string[] {
  const normal = normaliseColor(color);
  return [normal, ...list.filter((existing) => existing !== normal)].slice(0, max);
}

/** Adds a preset to the front, once (the same look is not saved twice). */
export function withPreset(list: TextPresetStyle[], preset: TextPresetStyle, max = MAX_TEXT_PRESETS): TextPresetStyle[] {
  const same = (a: TextPresetStyle, b: TextPresetStyle) => JSON.stringify(a) === JSON.stringify(b);
  return [preset, ...list.filter((existing) => !same(existing, preset))].slice(0, max);
}

interface FavoritesState {
  colors: string[];
  textPresets: TextPresetStyle[];
  addColor: (color: string) => void;
  removeColor: (color: string) => void;
  addTextPreset: (preset: TextPresetStyle) => void;
  removeTextPreset: (index: number) => void;
}

export const useFavoritesStore = create<FavoritesState>((set, get) => ({
  colors: read<string[]>(COLORS_KEY, []).filter((c) => typeof c === "string"),
  textPresets: read<TextPresetStyle[]>(TEXT_PRESETS_KEY, []),

  addColor: (color) => {
    const colors = withColor(get().colors, color);
    write(COLORS_KEY, colors);
    set({ colors });
  },
  removeColor: (color) => {
    const colors = get().colors.filter((existing) => existing !== normaliseColor(color));
    write(COLORS_KEY, colors);
    set({ colors });
  },
  addTextPreset: (preset) => {
    const textPresets = withPreset(get().textPresets, preset);
    write(TEXT_PRESETS_KEY, textPresets);
    set({ textPresets });
  },
  removeTextPreset: (index) => {
    const textPresets = get().textPresets.filter((_, i) => i !== index);
    write(TEXT_PRESETS_KEY, textPresets);
    set({ textPresets });
  },
}));
