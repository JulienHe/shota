use std::collections::HashMap;
use std::sync::OnceLock;

/// Translations for the native side ~ the tray menu and the updater dialogs.
///
/// Reads the same `locales/*.json` files the frontend imports, compiled in
/// with `include_str!`. Two catalogues would drift: the tray says "Quit
/// Shota" and the editor says "Close", and nothing would notice if only one
/// of them got translated.
///
/// Parsed once on first use. These strings are needed while building the
/// tray menu at startup, so there is no window to defer the work to.
static CATALOGUES: OnceLock<HashMap<&'static str, serde_json::Value>> = OnceLock::new();

fn catalogues() -> &'static HashMap<&'static str, serde_json::Value> {
    CATALOGUES.get_or_init(|| {
        let mut map = HashMap::new();
        for (tag, raw) in [
            ("en", include_str!("../../locales/en.json")),
            ("fr", include_str!("../../locales/fr.json")),
            ("de", include_str!("../../locales/de.json")),
            ("es", include_str!("../../locales/es.json")),
            ("ja", include_str!("../../locales/ja.json")),
            ("ko", include_str!("../../locales/ko.json")),
            ("zh-Hans", include_str!("../../locales/zh-Hans.json")),
            ("zh-Hant", include_str!("../../locales/zh-Hant.json")),
            ("pt-BR", include_str!("../../locales/pt-BR.json")),
            ("it", include_str!("../../locales/it.json")),
            ("nl", include_str!("../../locales/nl.json")),
            ("pl", include_str!("../../locales/pl.json")),
            ("ru", include_str!("../../locales/ru.json")),
            ("uk", include_str!("../../locales/uk.json")),
            ("tr", include_str!("../../locales/tr.json")),
        ] {
            match serde_json::from_str(raw) {
                Ok(value) => {
                    map.insert(tag, value);
                }
                // A malformed catalogue must not take the app down: English
                // is compiled in and every lookup already falls back to it.
                Err(err) => eprintln!("locale {tag} failed to parse: {err}"),
            }
        }
        map
    })
}

/// The locales Shota ships, in the order they're offered in settings.
pub const SUPPORTED: &[&str] = &[
    "en", "fr", "de", "es", "it", "pt-BR", "nl", "pl", "tr", "ru", "uk", "ja", "ko", "zh-Hans",
    "zh-Hant",
];

/// Tags Windows actually reports that the prefix walk in `resolve` can't
/// map on its own. Chinese is the important one: Windows says `zh-CN` and
/// `zh-TW`, not `zh-Hans-CN`, so without this every Chinese user got
/// English. Checked as prefixes, after an exact match fails.
const ALIASES: &[(&str, &str)] = &[
    ("zh-cn", "zh-Hans"),
    ("zh-sg", "zh-Hans"),
    ("zh-tw", "zh-Hant"),
    ("zh-hk", "zh-Hant"),
    ("zh-mo", "zh-Hant"),
    // Brazilian Portuguese reads fine in Portugal; English does not.
    ("pt", "pt-BR"),
];

/// Picks the best catalogue for an OS locale tag.
///
/// Windows reports things like `en-GB`, `fr-FR` or `zh-Hans-CN`, so an exact
/// match is the exception rather than the rule. Tries the whole tag, then
/// progressively shorter prefixes, then English.
pub fn resolve(tag: &str) -> &'static str {
    let lower = tag.to_ascii_lowercase();
    for candidate in SUPPORTED {
        if candidate.to_ascii_lowercase() == lower {
            return candidate;
        }
    }
    for (alias, target) in ALIASES {
        if lower == *alias || lower.starts_with(&format!("{alias}-")) {
            return target;
        }
    }
    // `zh-Hans-CN` should find `zh-Hans` before falling back to `zh`.
    let mut parts: Vec<&str> = lower.split('-').collect();
    while parts.len() > 1 {
        parts.pop();
        let prefix = parts.join("-");
        for candidate in SUPPORTED {
            if candidate.to_ascii_lowercase() == prefix {
                return candidate;
            }
        }
    }
    "en"
}

fn lookup(locale: &str, key: &str) -> Option<String> {
    let mut node = catalogues().get(locale)?;
    for part in key.split('.') {
        node = node.get(part)?;
    }
    node.as_str().map(|s| s.to_string())
}

/// Translates a dotted key, falling back to English and then to the key
/// itself ~ a wrong key should be visibly wrong, a missing translation
/// should merely be in English.
pub fn t(locale: &str, key: &str) -> String {
    lookup(locale, key)
        .or_else(|| lookup("en", key))
        .unwrap_or_else(|| key.to_string())
}

/// Translates and substitutes `{name}` placeholders.
///
/// Only the updater dialogs need placeholders on the native side, so the
/// Store build, which has no updater, never calls this.
#[cfg_attr(not(feature = "updater"), allow(dead_code))]
pub fn tf(locale: &str, key: &str, vars: &[(&str, &str)]) -> String {
    let mut out = t(locale, key);
    for (name, value) in vars {
        out = out.replace(&format!("{{{name}}}"), value);
    }
    out
}

/// The OS's preferred UI language, as Windows reports it.
#[cfg(windows)]
pub fn system_locale() -> Option<String> {
    use windows::Win32::Globalization::GetUserDefaultLocaleName;

    let mut buf = [0u16; 85]; // LOCALE_NAME_MAX_LENGTH
    let len = unsafe { GetUserDefaultLocaleName(&mut buf) };
    if len <= 1 {
        return None;
    }
    // The returned length counts the terminating null.
    Some(String::from_utf16_lossy(&buf[..(len as usize - 1)]))
}

#[cfg(not(windows))]
pub fn system_locale() -> Option<String> {
    std::env::var("LANG").ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_what_windows_actually_reports() {
        assert_eq!(resolve("en-US"), "en");
        assert_eq!(resolve("fr-CA"), "fr");
        assert_eq!(resolve("zh-CN"), "zh-Hans");
        assert_eq!(resolve("zh-SG"), "zh-Hans");
        assert_eq!(resolve("zh-TW"), "zh-Hant");
        assert_eq!(resolve("zh-HK"), "zh-Hant");
        assert_eq!(resolve("zh-Hans-CN"), "zh-Hans");
        assert_eq!(resolve("zh-Hant-TW"), "zh-Hant");
        assert_eq!(resolve("pt-BR"), "pt-BR");
        assert_eq!(resolve("pt-PT"), "pt-BR");
        assert_eq!(resolve("uk-UA"), "uk");
        assert_eq!(resolve("sv-SE"), "en");
    }

    #[test]
    fn every_supported_locale_has_a_catalogue() {
        for tag in SUPPORTED {
            assert!(catalogues().contains_key(tag), "{tag} has no catalogue");
            assert_ne!(t(tag, "tray.quit"), "tray.quit");
        }
    }
}
