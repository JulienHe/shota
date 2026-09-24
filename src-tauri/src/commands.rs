use serde::Serialize;
use tauri::{AppHandle, Manager};

use crate::capture::{self, WindowInfo};
use crate::clipboard;
use crate::file_save;
use crate::history::{self, HistoryListItem};
use crate::hotkeys::{self, ShortcutKind};
use crate::state::{AppState, PendingCapture};
use crate::windows::{
    close_history_window, hide_capture_overlay, hide_editor_window, open_capture_overlay,
    open_editor_from_history, open_editor_with_history, show_capture_overlay, show_editor_window,
    show_history_window,
};

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

/// Shared by `finish_region_capture` and `finish_window_capture`: hide the
/// overlay (its selection rectangle / dimming) and give the compositor a
/// moment to actually repaint without it before grabbing pixels — otherwise
/// the overlay's own chrome can get baked into the screenshot — then hand
/// whatever `capture_fn` actually captured off to the editor.
///
/// The overlay is left hidden rather than destroyed (see `open_capture_overlay`),
/// so it's already loaded and styled the next time — recreating it from
/// scratch on every single capture was showing a full white flash each time.
fn finish_capture(app: &AppHandle, capture_fn: impl FnOnce() -> Result<String, String>) -> Result<(), String> {
    hide_capture_overlay(app)?;
    std::thread::sleep(std::time::Duration::from_millis(120));
    let image = capture_fn()?;
    open_editor_with_history(app, image)
}

#[tauri::command]
pub async fn finish_region_capture(
    app: AppHandle,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
) -> Result<(), String> {
    finish_capture(&app, || capture::capture_region(x, y, width, height))
}

#[tauri::command]
pub async fn finish_window_capture(app: AppHandle, window_id: u32) -> Result<(), String> {
    finish_capture(&app, || capture::capture_window(window_id))
}

#[tauri::command]
pub async fn cancel_capture(app: AppHandle) -> Result<(), String> {
    hide_capture_overlay(&app)
}

#[tauri::command]
pub async fn capture_fullscreen_now(app: AppHandle, monitor_id: Option<u32>) -> Result<(), String> {
    let image = capture::capture_fullscreen(monitor_id)?;
    open_editor_with_history(&app, image)
}

#[tauri::command]
pub fn take_pending_capture(app: AppHandle) -> Option<PendingCapture> {
    app.state::<AppState>().take_pending_capture()
}

#[tauri::command]
pub fn editor_ready(app: AppHandle) -> Result<(), String> {
    show_editor_window(&app)
}

#[tauri::command]
pub fn close_editor_window(app: AppHandle) -> Result<(), String> {
    hide_editor_window(&app)
}

#[tauri::command]
pub fn copy_image_to_clipboard(app: AppHandle, png_base64: String) -> Result<(), String> {
    clipboard::copy_image_to_clipboard(&app, &png_base64)
}

#[tauri::command]
pub fn list_system_fonts() -> Vec<String> {
    crate::fonts::list_system_fonts()
}

#[tauri::command]
pub fn save_image_as(
    app: AppHandle,
    png_base64: String,
    suggested_name: String,
) -> Result<Option<String>, String> {
    file_save::save_image(&app, &png_base64, &suggested_name)
}

#[tauri::command]
pub fn list_history(app: AppHandle) -> Result<Vec<HistoryListItem>, String> {
    history::list_entries(&app)
}

#[tauri::command]
pub fn open_history_entry(app: AppHandle, id: String) -> Result<(), String> {
    open_editor_from_history(&app, &id)?;
    close_history_window(&app)
}

#[tauri::command]
pub fn update_history_entry(
    app: AppHandle,
    id: String,
    image_base64: String,
    shapes_json: String,
) -> Result<(), String> {
    history::update_entry(&app, &id, &image_base64, &shapes_json)
}

#[tauri::command]
pub fn delete_history_entry(app: AppHandle, id: String) -> Result<(), String> {
    history::delete_entry(&app, &id)
}

#[tauri::command]
pub fn clear_history(app: AppHandle) -> Result<(), String> {
    history::clear(&app)
}

#[tauri::command]
pub fn history_ready(app: AppHandle) -> Result<(), String> {
    show_history_window(&app)
}

#[tauri::command]
pub fn close_history_window_command(app: AppHandle) -> Result<(), String> {
    close_history_window(&app)
}
