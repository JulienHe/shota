use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle, Manager,
};

use crate::capture;
#[cfg(feature = "updater")]
use crate::updater;
use crate::windows::{open_capture_overlay, open_editor_with_history};

/// shota is a background/tray app: no taskbar presence, just a tray icon
/// with quick capture actions and a way to reach the shortcuts window.
pub fn build_tray(app: &AppHandle) -> Result<(), String> {
    let capture_fullscreen = MenuItem::with_id(app, "capture_fullscreen", "Capture Full Screen", true, None::<&str>)
        .map_err(|e| e.to_string())?;
    let capture_area = MenuItem::with_id(app, "capture_area", "Capture Area / Window", true, None::<&str>)
        .map_err(|e| e.to_string())?;
    let settings = MenuItem::with_id(app, "settings", "Keyboard Shortcuts…", true, None::<&str>)
        .map_err(|e| e.to_string())?;
    // Absent entirely in a Store build: the Store owns updates there, so an
    // item that checks GitHub would be both wrong and against policy.
    #[cfg(feature = "updater")]
    let check_updates = MenuItem::with_id(app, "check_updates", "Check for Updates…", true, None::<&str>)
        .map_err(|e| e.to_string())?;
    let quit = MenuItem::with_id(app, "quit", "Quit Shota", true, None::<&str>)
        .map_err(|e| e.to_string())?;

    let separator = PredefinedMenuItem::separator(app).map_err(|e| e.to_string())?;
    let mut items: Vec<&dyn tauri::menu::IsMenuItem<_>> =
        vec![&capture_fullscreen, &capture_area, &separator, &settings];
    #[cfg(feature = "updater")]
    items.push(&check_updates);
    let separator2 = PredefinedMenuItem::separator(app).map_err(|e| e.to_string())?;
    items.push(&separator2);
    items.push(&quit);

    let menu = Menu::with_items(app, &items).map_err(|e| e.to_string())?;

    let icon = app
        .default_window_icon()
        .cloned()
        .ok_or("missing default window icon for tray")?;

    TrayIconBuilder::new()
        .icon(icon)
        // Two tray icons look identical otherwise, and the dev one is the
        // last thing you want to quit by mistake mid-test.
        .tooltip(if cfg!(debug_assertions) { "Shota (dev)" } else { "Shota" })
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "capture_fullscreen" => match capture::capture_fullscreen(None) {
                Ok(image) => {
                    let _ = open_editor_with_history(app, image);
                }
                Err(err) => eprintln!("fullscreen capture failed: {err}"),
            },
            "capture_area" => {
                if let Err(err) = open_capture_overlay(app) {
                    eprintln!("failed to open capture overlay: {err}");
                }
            }
            "settings" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            #[cfg(feature = "updater")]
            "check_updates" => updater::check_for_updates(app, true),
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)
        .map_err(|e| e.to_string())?;

    Ok(())
}
