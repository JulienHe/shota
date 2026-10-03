use std::collections::HashMap;
use std::sync::OnceLock;

/// Translations for the native side — the tray menu and the updater dialogs.
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
        for (tag, raw) in [("en", include_str!("../../locales/en.json"))] {
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
pub const SUPPORTED: &[&str] = &["en"];

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
/// itself — a wrong key should be visibly wrong, a missing translation
/// should merely be in English.
pub fn t(locale: &str, key: &str) -> String {
    lookup(locale, key)
        .or_else(|| lookup("en", key))
        .unwrap_or_else(|| key.to_string())
}

/// Translates and substitutes `{name}` placeholders.
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
