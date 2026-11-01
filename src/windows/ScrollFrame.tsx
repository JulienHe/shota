import { useRevealWithoutFocus, useTransparentWindow } from "../lib/windowChrome";
import "./ScrollFrame.css";

/**
 * The dimmed screen with a clear window over the area being captured, shown
 * for the length of a scrolling capture so it is plain what is being taken.
 * The window covers a whole monitor, ignores the mouse and is kept out of the
 * pictures (see `scroll_frame.rs`); the area arrives in the URL, in pixels
 * from the monitor's top left.
 */
export function ScrollFrame() {
  useTransparentWindow();
  useRevealWithoutFocus();
  const [x, y, width, height] = (new URLSearchParams(window.location.search).get("r") ?? "0,0,0,0")
    .split(",")
    .map((value) => Number(value) / window.devicePixelRatio);
  return <div className="scroll-frame" style={{ left: x, top: y, width, height }} />;
}
