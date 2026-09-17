use serde::Serialize;
use tauri::{AppHandle, Manager};

use crate::capture::{self, WindowInfo};
use crate::clipboard;
use crate::file_save;
use crate::hotkeys::{self, ShortcutKind};
use crate::state::AppState;
use crate::windows::{close_capture_overlay, open_capture_overlay, open_editor_window, show_capture_overlay};

#[derive(Serialize)]
pub struct ShortcutsPayload {
    pub fullscreen: String,
    pub area: String,
}

#[tauri::command]
pub fn get_shortcuts(app: AppHandle) -> ShortcutsPayload {
    let (fullscreen, area) = app.state::<AppState>().shortcuts();
    ShortcutsPayload { fullscreen, area }
}

#[tauri::command]
pub fn set_shortcut(app: AppHandle, kind: ShortcutKind, accelerator: String) -> Result<(), String> {
    hotkeys::update_shortcut(&app, kind, accelerator)
}

#[tauri::command]
pub fn list_capturable_windows() -> Result<Vec<WindowInfo>, String> {
    capture::list_windows()
}

#[tauri::command]
pub fn open_capture_overlay_command(app: AppHandle) -> Result<(), String> {
    open_capture_overlay(&app)
}

#[tauri::command]
pub fn overlay_ready(app: AppHandle) -> Result<(), String> {
    show_capture_overlay(&app)
}

#[tauri::command]
pub async fn finish_region_capture(
    app: AppHandle,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
) -> Result<(), String> {
    let image = capture::capture_region(x, y, width, height)?;
    close_capture_overlay(&app)?;
    open_editor_window(&app, image)
}

#[tauri::command]
pub async fn finish_window_capture(app: AppHandle, window_id: u32) -> Result<(), String> {
    let image = capture::capture_window(window_id)?;
    close_capture_overlay(&app)?;
    open_editor_window(&app, image)
}

#[tauri::command]
pub async fn cancel_capture(app: AppHandle) -> Result<(), String> {
    close_capture_overlay(&app)
}

#[tauri::command]
pub async fn capture_fullscreen_now(app: AppHandle, monitor_id: Option<u32>) -> Result<(), String> {
    let image = capture::capture_fullscreen(monitor_id)?;
    open_editor_window(&app, image)
}

#[tauri::command]
pub fn take_pending_image(app: AppHandle) -> Option<String> {
    app.state::<AppState>().take_pending_image()
}

#[tauri::command]
pub fn copy_image_to_clipboard(app: AppHandle, png_base64: String) -> Result<(), String> {
    clipboard::copy_image_to_clipboard(&app, &png_base64)
}

#[tauri::command]
pub fn save_image_as(
    app: AppHandle,
    png_base64: String,
    suggested_name: String,
) -> Result<Option<String>, String> {
    file_save::save_image(&app, &png_base64, &suggested_name)
}
