use tauri::{AppHandle, Theme};

use crate::state::ThemePreference;

/// Applies the theme setting to every Shota window, current and future.
///
/// This sets the theme WebView2 reports to the page, so the CSS already
/// written against `prefers-color-scheme` follows the setting with no
/// changes of its own, and the settings window's native title bar follows
/// along with it. `None` hands control back to Windows.
pub fn apply(app: &AppHandle, preference: ThemePreference) {
    app.set_theme(match preference {
        ThemePreference::System => None,
        ThemePreference::Light => Some(Theme::Light),
        ThemePreference::Dark => Some(Theme::Dark),
    });
}
