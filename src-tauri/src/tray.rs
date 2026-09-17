use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle, Manager,
};

use crate::capture;
use crate::windows::{open_capture_overlay, open_editor_window};

/// shota is a background/tray app: no taskbar presence, just a tray icon
/// with quick capture actions and a way to reach the shortcuts window.
pub fn build_tray(app: &AppHandle) -> Result<(), String> {
    let capture_fullscreen = MenuItem::with_id(app, "capture_fullscreen", "Capture Full Screen", true, None::<&str>)
        .map_err(|e| e.to_string())?;
    let capture_area = MenuItem::with_id(app, "capture_area", "Capture Area / Window", true, None::<&str>)
        .map_err(|e| e.to_string())?;
    let settings = MenuItem::with_id(app, "settings", "Keyboard Shortcuts…", true, None::<&str>)
        .map_err(|e| e.to_string())?;
    let quit = MenuItem::with_id(app, "quit", "Quit shota", true, None::<&str>)
        .map_err(|e| e.to_string())?;

    let menu = Menu::with_items(
        app,
        &[
            &capture_fullscreen,
            &capture_area,
            &PredefinedMenuItem::separator(app).map_err(|e| e.to_string())?,
            &settings,
            &PredefinedMenuItem::separator(app).map_err(|e| e.to_string())?,
            &quit,
        ],
    )
    .map_err(|e| e.to_string())?;

    let icon = app
        .default_window_icon()
        .cloned()
        .ok_or("missing default window icon for tray")?;

    TrayIconBuilder::new()
        .icon(icon)
        .tooltip("shota")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "capture_fullscreen" => match capture::capture_fullscreen(None) {
                Ok(image) => {
                    let _ = open_editor_window(app, image);
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
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)
        .map_err(|e| e.to_string())?;

    Ok(())
}
