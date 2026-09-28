import { createLucideIcon } from "lucide-react";

/**
 * A circled "1" — what the step tool actually draws. Lucide has no circled
 * digit, so this is built with its own factory rather than hand-rolled SVG,
 * which keeps the stroke width, line caps and sizing identical to every
 * other icon in the toolbar.
 */
export const CircleOne = createLucideIcon("CircleOne", [
  ["circle", { cx: "12", cy: "12", r: "10", key: "badge" }],
  // The digit, drawn as strokes to match the surrounding line art: angled
  // flag, stem, then a foot so it reads as a "1" rather than a tally mark.
  ["path", { d: "M10.4 9.8 12.2 8.2", key: "flag" }],
  ["path", { d: "M12.2 8.2v7.6", key: "stem" }],
  ["path", { d: "M10 15.8h4.4", key: "foot" }],
]);
