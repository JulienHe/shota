const pad = (n: number) => String(n).padStart(2, "0");

/** The placeholders a file name pattern understands, in the order settings
 * lists them. */
export const FILE_NAME_TOKENS = ["{date}", "{time}", "{width}", "{height}"] as const;

/**
 * Fills in a file name pattern from settings, e.g. "Shota {date} {time}"
 * becomes "Shota 2026-10-11 14-05-09".
 *
 * Dates are ISO order whatever the locale, so saved files sort by name in
 * the order they were taken. Time uses dashes because Windows forbids
 * colons in file names. Rust strips anything else Windows rejects, so a
 * pattern can't produce a name that fails to save.
 */
export function formatFileName(pattern: string, date: Date, size: { width: number; height: number }): string {
  const values: Record<string, string> = {
    "{date}": `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    "{time}": `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`,
    "{width}": String(size.width),
    "{height}": String(size.height),
  };
  return pattern.replace(/\{(date|time|width|height)\}/g, (token) => values[token]);
}
