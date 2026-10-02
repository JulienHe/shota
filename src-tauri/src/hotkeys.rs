use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

use crate::capture;
use crate::state::AppState;
use crate::windows::{open_capture_overlay, open_editor_with_history, toggle_history_window};

// A global shortcut can only be held by one process at a time, so a debug
// build and an installed release build fight over these: whichever registers
// first wins and the other silently gets nothing. Debug builds therefore take
// a different set, which is what makes it possible to run `tauri dev` against
// an installed Shota — needed to test the updater, since that can only be
// exercised by a real install talking to a real release.
#[cfg(not(debug_assertions))]
pub const DEFAULT_FULLSCREEN_SHORTCUT: &str = "Ctrl+Shift+3";
#[cfg(not(debug_assertions))]
pub const DEFAULT_AREA_SHORTCUT: &str = "Ctrl+Shift+4";
/// Not user-rebindable (yet) — no entry in ShortcutKind/PersistedSettings,
/// unlike Fullscreen/Area which have a settings UI.
#[cfg(not(debug_assertions))]
pub const HISTORY_SHORTCUT: &str = "Ctrl+Shift+6";

#[cfg(debug_assertions)]
pub const DEFAULT_FULLSCREEN_SHORTCUT: &str = "Ctrl+Alt+Shift+3";
#[cfg(debug_assertions)]
pub const DEFAULT_AREA_SHORTCUT: &str = "Ctrl+Alt+Shift+4";
#[cfg(debug_assertions)]
pub const HISTORY_SHORTCUT: &str = "Ctrl+Alt+Shift+6";

#[derive(Deserialize, Serialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ShortcutKind {
    Fullscreen,
    Area,
}

/// Registers both global shortcuts using whatever accelerators are currently
/// stored in AppState (defaults, or whatever the user last rebound them to).
pub fn register_all(app: &AppHandle) -> Result<(), String> {
    let (fullscreen, area) = app.state::<AppState>().shortcuts();
    register_one(app, ShortcutKind::Fullscreen, &fullscreen)?;
    register_one(app, ShortcutKind::Area, &area)?;
    Ok(())
}

fn register_one(app: &AppHandle, kind: ShortcutKind, accelerator: &str) -> Result<(), String> {
    let handler_app = app.clone();
    app.global_shortcut()
        .on_shortcut(accelerator, move |_app, _shortcut, event| {
            if event.state() != ShortcutState::Pressed {
                return;
            }
            match kind {
                ShortcutKind::Fullscreen => match capture::capture_fullscreen(None) {
                    Ok(image) => {
                        let _ = open_editor_with_history(&handler_app, image);
                    }
                    Err(err) => eprintln!("fullscreen capture failed: {err}"),
                },
                ShortcutKind::Area => {
                    if let Err(err) = open_capture_overlay(&handler_app) {
                        eprintln!("failed to open capture overlay: {err}");
                    }
                }
            }
        })
        .map_err(|e| e.to_string())
}

/// Rebinds a shortcut at runtime: unregisters the current accelerator for
/// `kind`, registers the new one, and persists it so it survives a restart.
pub fn update_shortcut(app: &AppHandle, kind: ShortcutKind, accelerator: String) -> Result<(), String> {
    let state = app.state::<AppState>();
    let (fullscreen, area) = state.shortcuts();
    let previous = match kind {
        ShortcutKind::Fullscreen => fullscreen,
        ShortcutKind::Area => area,
    };

    app.global_shortcut()
        .unregister(previous.as_str())
        .map_err(|e| e.to_string())?;

    if let Err(err) = register_one(app, kind, &accelerator) {
        // Roll back so we don't leave the user with no shortcut registered at all.
        let _ = register_one(app, kind, &previous);
        return Err(err);
    }

    state.set_shortcut(app, kind, accelerator);
    Ok(())
}

/// Registers the fixed Ctrl+Shift+6 shortcut that toggles the history
/// carousel — separate from `register_all` since it isn't part of the
/// rebindable Fullscreen/Area shortcut set.
pub fn register_history_shortcut(app: &AppHandle) -> Result<(), String> {
    let handler_app = app.clone();
    app.global_shortcut()
        .on_shortcut(HISTORY_SHORTCUT, move |_app, _shortcut, event| {
            if event.state() != ShortcutState::Pressed {
                return;
            }
            if let Err(err) = toggle_history_window(&handler_app) {
                eprintln!("failed to toggle history window: {err}");
            }
        })
        .map_err(|e| e.to_string())
}
