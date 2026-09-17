use tauri::AppHandle;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

use crate::capture;
use crate::windows::{open_capture_overlay, open_editor_window};

pub const FULLSCREEN_SHORTCUT: &str = "Ctrl+Alt+F";
pub const AREA_SHORTCUT: &str = "Ctrl+Alt+A";

/// Registers the app's global keyboard shortcuts. These work even when shota
/// isn't focused, which is the whole point of a screenshot tool.
pub fn register_shortcuts(app: &AppHandle) -> Result<(), String> {
    let fullscreen_app = app.clone();
    app.global_shortcut()
        .on_shortcut(FULLSCREEN_SHORTCUT, move |_app, _shortcut, event| {
            if event.state() != ShortcutState::Pressed {
                return;
            }
            match capture::capture_fullscreen(None) {
                Ok(image) => {
                    let _ = open_editor_window(&fullscreen_app, image);
                }
                Err(err) => eprintln!("fullscreen capture failed: {err}"),
            }
        })
        .map_err(|e| e.to_string())?;

    let area_app = app.clone();
    app.global_shortcut()
        .on_shortcut(AREA_SHORTCUT, move |_app, _shortcut, event| {
            if event.state() != ShortcutState::Pressed {
                return;
            }
            if let Err(err) = open_capture_overlay(&area_app) {
                eprintln!("failed to open capture overlay: {err}");
            }
        })
        .map_err(|e| e.to_string())?;

    Ok(())
}
