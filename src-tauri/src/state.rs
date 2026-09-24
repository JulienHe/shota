use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

use crate::hotkeys::{ShortcutKind, DEFAULT_AREA_SHORTCUT, DEFAULT_FULLSCREEN_SHORTCUT};

/// A capture handed off to the editor window: the raw (never annotation-
/// baked) image, which history entry it belongs to (if any), and whatever
/// shapes were previously saved against that entry, if reopened from history.
#[derive(Serialize, Clone)]
pub struct PendingCapture {
    pub image_base64: String,
    pub history_id: Option<String>,
    pub shapes_json: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
struct PersistedSettings {
    last_save_dir: Option<String>,
    #[serde(default = "default_fullscreen_shortcut")]
    fullscreen_shortcut: String,
    #[serde(default = "default_area_shortcut")]
    area_shortcut: String,
}

fn default_fullscreen_shortcut() -> String {
    DEFAULT_FULLSCREEN_SHORTCUT.to_string()
}

fn default_area_shortcut() -> String {
    DEFAULT_AREA_SHORTCUT.to_string()
}

impl Default for PersistedSettings {
    fn default() -> Self {
        Self {
            last_save_dir: None,
            fullscreen_shortcut: default_fullscreen_shortcut(),
            area_shortcut: default_area_shortcut(),
        }
    }
}

pub struct AppState {
    settings: Mutex<PersistedSettings>,
    /// Holds a freshly captured image while the editor window spins up, so it
    /// can pull it via a command instead of racing an event listener.
    pending_capture: Mutex<Option<PendingCapture>>,
}

impl AppState {
    pub fn load(app: &AppHandle) -> Self {
        let settings = read_settings(app).unwrap_or_default();
        Self {
            settings: Mutex::new(settings),
            pending_capture: Mutex::new(None),
        }
    }

    pub fn set_pending_capture(&self, capture: PendingCapture) {
        *self.pending_capture.lock().unwrap() = Some(capture);
    }

    pub fn take_pending_capture(&self) -> Option<PendingCapture> {
        self.pending_capture.lock().unwrap().take()
    }

    pub fn last_save_dir(&self) -> Option<String> {
        self.settings.lock().unwrap().last_save_dir.clone()
    }

    pub fn set_last_save_dir(&self, app: &AppHandle, dir: String) {
        let mut settings = self.settings.lock().unwrap();
        settings.last_save_dir = Some(dir);
        let _ = write_settings(app, &settings);
    }

    pub fn shortcuts(&self) -> (String, String) {
        let settings = self.settings.lock().unwrap();
        (settings.fullscreen_shortcut.clone(), settings.area_shortcut.clone())
    }

    pub fn set_shortcut(&self, app: &AppHandle, kind: ShortcutKind, accelerator: String) {
        let mut settings = self.settings.lock().unwrap();
        match kind {
            ShortcutKind::Fullscreen => settings.fullscreen_shortcut = accelerator,
            ShortcutKind::Area => settings.area_shortcut = accelerator,
        }
        let _ = write_settings(app, &settings);
    }
}

fn settings_path(app: &AppHandle) -> Option<PathBuf> {
    let dir = app.path().app_config_dir().ok()?;
    Some(dir.join("settings.json"))
}

fn read_settings(app: &AppHandle) -> Option<PersistedSettings> {
    let path = settings_path(app)?;
    let content = fs::read_to_string(path).ok()?;
    serde_json::from_str(&content).ok()
}

fn write_settings(app: &AppHandle, settings: &PersistedSettings) -> Result<(), String> {
    let path = settings_path(app).ok_or("Could not resolve app config dir")?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let content = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(path, content).map_err(|e| e.to_string())
}
