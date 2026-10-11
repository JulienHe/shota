/** Accelerator names are for the shortcut parser; these are for people,
 * and match what's printed on most keyboards. */
const KEY_LABELS: Record<string, string> = {
  PrintScreen: "PrtSc",
  Super: "Win",
  Up: "↑",
  Down: "↓",
  Left: "←",
  Right: "→",
  Escape: "Esc",
  PageUp: "PgUp",
  PageDown: "PgDn",
  Backquote: "`",
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/",
};

export function acceleratorKeys(accelerator: string): string[] {
  return accelerator.split("+").map((key) => KEY_LABELS[key] ?? key);
}

/** One line of text, for tooltips. */
export function formatAcceleratorLabel(accelerator: string): string {
  return acceleratorKeys(accelerator).join("+");
}
