use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

use crate::capture;
use crate::snapshot_hook;
use crate::state::AppState;
use crate::windows::{open_capture_overlay, open_editor_with_history, toggle_history_window};

// A global shortcut can only be held by one process at a time, so a debug
// build and an installed release build fight over these: whichever registers
// first wins and the other silently gets nothing. Debug builds therefore take
// a different set, which is what makes it possible to run `tauri dev` against
// an installed Shota ~ needed to test the updater, since that can only be
// exercised by a real install talking to a real release.
// Windows convention, not macOS. The previous defaults (Ctrl+Shift+3/4)
// were Cmd+Shift+3/4 carried over from macOS, which nobody on Windows
// reaches for. Every established Windows tool ~ Greenshot, Lightshot,
// Snagit, and the built-in Snipping Tool ~ puts capture on Print Screen,
// and puts *region* there rather than full screen, because region is what
// people want most of the time.
#[cfg(not(debug_assertions))]
pub const DEFAULT_FULLSCREEN_SHORTCUT: &str = "Ctrl+PrintScreen";
#[cfg(not(debug_assertions))]
pub const DEFAULT_AREA_SHORTCUT: &str = "PrintScreen";
#[cfg(not(debug_assertions))]
pub const DEFAULT_HISTORY_SHORTCUT: &str = "Shift+PrintScreen";

#[cfg(debug_assertions)]
pub const DEFAULT_FULLSCREEN_SHORTCUT: &str = "Ctrl+Alt+3";
#[cfg(debug_assertions)]
pub const DEFAULT_AREA_SHORTCUT: &str = "Ctrl+Alt+4";
#[cfg(debug_assertions)]
pub const DEFAULT_HISTORY_SHORTCUT: &str = "Ctrl+Alt+5";

#[derive(Deserialize, Serialize, Clone, Copy, PartialEq, Eq, Debug)]
#[serde(rename_all = "snake_case")]
pub enum ShortcutKind {
    Fullscreen,
    Area,
    History,
}

const ALL_KINDS: [ShortcutKind; 3] = [ShortcutKind::Area, ShortcutKind::Fullscreen, ShortcutKind::History];

#[derive(Serialize, Clone, Debug)]
pub struct Shortcuts {
    pub fullscreen: String,
    pub area: String,
    pub history: String,
}

impl Shortcuts {
    pub fn get(&self, kind: ShortcutKind) -> &str {
        match kind {
            ShortcutKind::Fullscreen => &self.fullscreen,
            ShortcutKind::Area => &self.area,
            ShortcutKind::History => &self.history,
        }
    }
}

pub fn defaults() -> Shortcuts {
    Shortcuts {
        fullscreen: DEFAULT_FULLSCREEN_SHORTCUT.to_string(),
        area: DEFAULT_AREA_SHORTCUT.to_string(),
        history: DEFAULT_HISTORY_SHORTCUT.to_string(),
    }
}

/// Registers every global shortcut from what's stored in AppState.
///
/// One that fails is logged and skipped rather than failing the rest. This
/// runs at startup, and it used to `expect()`: a shortcut someone chose that
/// another app has since claimed would crash Shota on launch, every launch,
/// with no window open to explain why. Settings shows what's actually bound.
///
/// Skips anything already registered, so it doubles as "resume" after
/// recording, when `update_shortcut` may already have bound the new one.
pub fn register_all(app: &AppHandle) {
    let shortcuts = app.state::<AppState>().shortcuts();
    for kind in ALL_KINDS {
        let accelerator = shortcuts.get(kind);
        if is_held(app, kind, accelerator) {
            continue;
        }
        if let Err(err) = register_one(app, kind, accelerator) {
            eprintln!("could not register {kind:?} shortcut {accelerator}: {err}");
        }
    }
}

/// Releases every global shortcut while the settings window records a new
/// one. Without this, pressing a combination Shota already owns fires it ~
/// trying to rebind Print Screen would start a capture instead ~ and
/// Windows delivers a registered hotkey to its owner, not to the focused
/// window, so the recorder would never see the keys at all.
pub fn pause(app: &AppHandle) {
    let _ = app.global_shortcut().unregister_all();
    snapshot_hook::clear();
}

/// Whether `accelerator` is already live for `kind`, by whichever mechanism
/// serves it (see `snapshot_hook` for why Print Screen has its own).
fn is_held(app: &AppHandle, kind: ShortcutKind, accelerator: &str) -> bool {
    if snapshot_hook::modifiers_of(accelerator).is_some() {
        return snapshot_hook::is_bound(kind);
    }
    app.global_shortcut().is_registered(accelerator)
}

/// What a shortcut does when pressed.
pub fn fire(app: &AppHandle, kind: ShortcutKind) {
    match kind {
        ShortcutKind::Fullscreen => match capture::capture_fullscreen(None) {
            Ok(image) => {
                let _ = open_editor_with_history(app, image);
            }
            Err(err) => eprintln!("fullscreen capture failed: {err}"),
        },
        ShortcutKind::Area => {
            if let Err(err) = open_capture_overlay(app) {
                eprintln!("failed to open capture overlay: {err}");
            }
        }
        ShortcutKind::History => {
            if let Err(err) = toggle_history_window(app) {
                eprintln!("failed to toggle history window: {err}");
            }
        }
    }
}

fn register_one(app: &AppHandle, kind: ShortcutKind, accelerator: &str) -> Result<(), String> {
    if let Some(mods) = snapshot_hook::modifiers_of(accelerator) {
        snapshot_hook::bind(app, kind, mods);
        return Ok(());
    }
    let handler_app = app.clone();
    app.global_shortcut()
        .on_shortcut(accelerator, move |_app, _shortcut, event| {
            if event.state() == ShortcutState::Pressed {
                fire(&handler_app, kind);
            }
        })
        .map_err(|e| e.to_string())
}

/// Rebinds a shortcut at runtime: releases the old accelerator for `kind`,
/// binds the new one, and persists it so it survives a restart.
///
/// Refuses an accelerator another of Shota's own shortcuts already uses.
/// The OS would only report that later, when re-registering the other one
/// failed, and by then one of the two would simply be gone.
pub fn update_shortcut(app: &AppHandle, kind: ShortcutKind, accelerator: String) -> Result<(), String> {
    let state = app.state::<AppState>();
    let shortcuts = state.shortcuts();
    let previous = shortcuts.get(kind).to_string();

    let taken = ALL_KINDS
        .iter()
        .any(|&other| other != kind && shortcuts.get(other).eq_ignore_ascii_case(&accelerator));
    if taken {
        return Err("conflict".to_string());
    }

    // May legitimately fail: while recording, everything is already paused.
    let _ = app.global_shortcut().unregister(previous.as_str());
    snapshot_hook::unbind(kind);

    if let Err(err) = register_one(app, kind, &accelerator) {
        // Roll back so we don't leave the user with no shortcut registered at all.
        let _ = register_one(app, kind, &previous);
        return Err(err);
    }

    state.set_shortcut(app, kind, accelerator);
    Ok(())
}
