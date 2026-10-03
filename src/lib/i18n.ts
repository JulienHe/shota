import en from "../../locales/en.json";

/**
 * Translation lookup for the frontend.
 *
 * The catalogues live in `locales/` at the repo root rather than under `src/`
 * because Rust reads the same files — the tray menu and the updater dialogs
 * are native, and keeping two copies of "Quit Shota" in two languages each
 * is how they end up disagreeing.
 *
 * Every locale is bundled rather than fetched. The whole set is a few
 * kilobytes, and these windows must render instantly on a capture: an async
 * load would mean a frame of untranslated UI, or a frame of nothing.
 */
const CATALOGUES: Record<string, unknown> = {
  en,
};

export type Locale = keyof typeof CATALOGUES & string;

let active = "en";

/** Set once at startup from the locale Rust resolved. */
export function setLocale(locale: string) {
  active = CATALOGUES[locale] ? locale : "en";
}

export function currentLocale(): string {
  return active;
}

function lookup(catalogue: unknown, path: string): string | undefined {
  const value = path.split(".").reduce<unknown>((node, key) => {
    if (node && typeof node === "object" && key in (node as Record<string, unknown>)) {
      return (node as Record<string, unknown>)[key];
    }
    return undefined;
  }, catalogue);
  return typeof value === "string" ? value : undefined;
}

/**
 * Translates a dotted key, e.g. `t("tools.highlight")`.
 *
 * Falls back to English for a missing key rather than rendering the key
 * itself: a half-translated catalogue should look like an untranslated
 * button, not like a bug. Returns the key only if English lacks it too,
 * which means the key is wrong and should be obvious.
 */
export function t(key: string, vars?: Record<string, string | number>): string {
  const template = lookup(CATALOGUES[active], key) ?? lookup(en, key) ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    name in vars ? String(vars[name]) : match,
  );
}
