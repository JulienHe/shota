import { createLucideIcon } from "lucide-react";

/**
 * A dimmed frame with one bright rectangle inside it — the tool's own
 * output in miniature. Built with lucide's factory so stroke width, caps and
 * sizing match the rest of the toolbar.
 */
export const SpotlightRect = createLucideIcon("SpotlightRect", [
  ["rect", { x: "3", y: "3", width: "18", height: "18", rx: "3", key: "frame" }],
  // Filled, so it reads as the lit region rather than a second empty frame.
  ["rect", { x: "6", y: "6", width: "8", height: "6", rx: "1.5", fill: "currentColor", key: "lit" }],
]);
