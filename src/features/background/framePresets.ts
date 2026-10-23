import { Frame } from "./frame";

/**
 * Whole looks in one click: a background with the padding, corners, shadow
 * and shape that suit it. Choosing one replaces the frame; every part of it
 * can still be adjusted afterwards.
 *
 * The gradients are named by their ids in webgradients.json.
 */
export const FRAME_PRESETS: { id: string; label: string; frame: Frame }[] = [
  {
    id: "clean",
    label: "background.presetClean",
    frame: { background: { kind: "color", color: "#ffffff" }, padding: 30, corners: 30, shadow: 40 },
  },
  {
    id: "sunset",
    label: "background.presetSunset",
    frame: { background: { kind: "gradient", id: "wg-021" }, padding: 45, corners: 40, shadow: 50 },
  },
  {
    id: "square",
    label: "background.presetSquare",
    frame: { background: { kind: "gradient", id: "wg-019" }, padding: 40, corners: 35, shadow: 45, aspect: 1 },
  },
  {
    id: "wide",
    label: "background.presetWide",
    frame: { background: { kind: "gradient", id: "wg-168" }, padding: 40, corners: 35, shadow: 45, aspect: 16 / 9 },
  },
  {
    id: "story",
    label: "background.presetStory",
    frame: { background: { kind: "gradient", id: "wg-084" }, padding: 40, corners: 35, shadow: 45, aspect: 9 / 16 },
  },
  {
    id: "shadow",
    label: "background.presetShadow",
    frame: { background: { kind: "color", color: "transparent" }, padding: 14, corners: 20, shadow: 55 },
  },
];

/** The shapes the frame can be made, width over height. `null` follows the screenshot. */
export const FRAME_ASPECTS: { id: string; label: string | null; ratio: number | null }[] = [
  { id: "auto", label: null, ratio: null },
  { id: "1:1", label: "1:1", ratio: 1 },
  { id: "4:3", label: "4:3", ratio: 4 / 3 },
  { id: "16:9", label: "16:9", ratio: 16 / 9 },
  { id: "9:16", label: "9:16", ratio: 9 / 16 },
];
