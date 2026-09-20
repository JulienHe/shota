use font_kit::source::SystemSource;

/// Lists the font family names actually installed on this machine (via
/// DirectWrite on Windows), so the font picker only ever offers fonts that
/// will really render — no bundling, no network fetch, just reading what's
/// already there.
pub fn list_system_fonts() -> Vec<String> {
    let mut families = SystemSource::new().all_families().unwrap_or_default();
    families.sort_by_key(|f| f.to_lowercase());
    families.dedup();
    families
}
