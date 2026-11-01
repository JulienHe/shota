use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_clipboard_manager::ClipboardExt;

use crate::capture::{self, WindowInfo};
use crate::clipboard;
use crate::file_save;
use crate::history::{self, HistoryListItem};
use crate::hotkeys::{self, ShortcutKind, Shortcuts};
use crate::state::{AppState, ImageFormat, PendingCapture, Preferences};
use crate::startup::{self, StartupStatus};
use crate::windows::{open_pin, open_pin_centred, 
    cancel_capture_overlay, close_history_window, overlay_painted, pending_freeze, hide_capture_overlay, hide_editor_window, open_capture_overlay,
    open_editor_from_history, open_editor_with_history, show_capture_overlay, show_editor_window,
    show_history_window,
};

#[tauri::command]
pub fn get_shortcuts(app: AppHandle) -> Shortcuts {
    app.state::<AppState>().shortcuts()
}

#[tauri::command]
pub fn default_shortcuts() -> Shortcuts {
    hotkeys::defaults()
}

#[tauri::command]
pub fn set_shortcut(app: AppHandle, kind: ShortcutKind, accelerator: String) -> Result<(), String> {
    hotkeys::update_shortcut(&app, kind, accelerator)
}

/// Releases every global shortcut while settings records a new one, or
/// takes them back afterwards. See `hotkeys::pause`.
#[tauri::command]
pub fn pause_global_shortcuts(app: AppHandle, paused: bool) {
    if paused {
        hotkeys::pause(&app);
    } else {
        hotkeys::register_all(&app);
    }
}

#[tauri::command]
pub fn get_preferences(app: AppHandle) -> Preferences {
    app.state::<AppState>().preferences()
}

/// Saves the whole preferences object, applies whatever changed, and tells
/// every window. The editor in particular is long-lived and reused, so it
/// can't just read these once on mount and keep them.
#[tauri::command]
pub fn set_preferences(app: AppHandle, preferences: Preferences) -> Result<Preferences, String> {
    let (previous, next) = app.state::<AppState>().set_preferences(&app, preferences)?;

    if previous.theme != next.theme {
        crate::theme::apply(&app, next.theme);
    }
    if previous.history_limit != next.history_limit || previous.history_max_age_days != next.history_max_age_days {
        // Deleting files is real I/O, and the settings window is waiting.
        let handle = app.clone();
        std::thread::spawn(move || {
            if let Err(err) = history::apply_retention(&handle) {
                eprintln!("applying history retention failed: {err}");
            }
        });
    }

    if previous.explorer_menu != next.explorer_menu {
        let handle = app.clone();
        std::thread::spawn(move || crate::explorer::apply(&handle));
    }

    let _ = app.emit("shota://preferences-changed", &next);
    Ok(next)
}

/// Async so reading the registry or WinRT never runs on the main thread.
#[tauri::command]
pub async fn get_launch_at_startup(app: AppHandle) -> StartupStatus {
    startup::status(&app)
}

#[tauri::command]
pub async fn set_launch_at_startup(app: AppHandle, enabled: bool) -> Result<StartupStatus, String> {
    startup::set(&app, enabled)
}

/// Async because it walks the history folder on disk.
#[tauri::command]
pub async fn history_usage(app: AppHandle) -> Result<history::HistoryUsage, String> {
    history::usage(&app)
}

/// Whether Windows is holding Print Screen for the Snipping Tool, which
/// would swallow Shota's default capture shortcut before it ever arrives.
/// Whether this copy runs from the Store package, where some settings (the
/// Explorer menu) are fixed by the manifest instead of being toggleable.
#[tauri::command]
pub fn is_store_install() -> bool {
    crate::startup::is_packaged()
}

#[tauri::command]
pub fn print_screen_owned_by_snipping_tool() -> bool {
    crate::printscreen::owned_by_snipping_tool()
}

/// Hands Print Screen back to applications. Per-user, no elevation.
#[tauri::command]
pub fn release_print_screen() -> Result<(), String> {
    crate::printscreen::release_to_apps()
}

/// The locale the UI should render in, resolved on the Rust side so the
/// native menus and the webview can never disagree about it.
#[tauri::command]
pub fn get_locale(app: AppHandle) -> String {
    app.state::<AppState>().locale()
}

/// `None` means follow Windows.
#[tauri::command]
pub fn set_language(app: AppHandle, language: Option<String>) -> Result<(), String> {
    app.state::<AppState>().set_language(&app, language)?;
    // The Explorer menu's label is in the UI language too.
    let handle = app.clone();
    std::thread::spawn(move || crate::explorer::apply(&handle));
    Ok(())
}

#[tauri::command]
pub fn get_language(app: AppHandle) -> Option<String> {
    app.state::<AppState>().language()
}

#[tauri::command]
pub fn supported_locales() -> Vec<String> {
    crate::i18n::SUPPORTED.iter().map(|s| s.to_string()).collect()
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

/// The frozen screen the overlay should paint, if a capture is waiting for it.
#[tauri::command]
pub fn pending_freeze_id(app: AppHandle) -> Option<u64> {
    pending_freeze(&app)
}

/// The frozen screen as raw pixels, over IPC as bytes (never base64, see the
/// notes on `take_capture_image`). A 16-byte header of four little-endian
/// 32-bit integers (width, height, desktop x, desktop y of the top-left),
/// then width*height RGBA. Not removed: the capture is cropped from it later.
#[tauri::command]
pub fn take_freeze(app: AppHandle, id: u64) -> Result<tauri::ipc::Response, String> {
    let (current, desktop) = app
        .state::<AppState>()
        .freeze()
        .ok_or_else(|| "no frozen screen".to_string())?;
    if current != id {
        return Err("that frozen screen has been replaced".to_string());
    }
    let (width, height) = desktop.image.dimensions();
    let raw = desktop.image.as_raw();
    let mut bytes = Vec::with_capacity(16 + raw.len());
    bytes.extend_from_slice(&width.to_le_bytes());
    bytes.extend_from_slice(&height.to_le_bytes());
    bytes.extend_from_slice(&desktop.origin_x.to_le_bytes());
    bytes.extend_from_slice(&desktop.origin_y.to_le_bytes());
    bytes.extend_from_slice(raw);
    Ok(tauri::ipc::Response::new(bytes))
}

/// The overlay page has painted the frozen screen `id`: reveal it.
#[tauri::command]
pub fn overlay_painted_command(app: AppHandle, id: u64) -> Result<(), String> {
    let handle = app.clone();
    app.run_on_main_thread(move || overlay_painted(&handle, id))
        .map_err(|e| e.to_string())
}

/// Shared by `finish_region_capture` and `finish_window_capture`: hide the
/// overlay (its selection rectangle / dimming) and give the compositor a
/// moment to actually repaint without it before grabbing pixels ~ otherwise
/// the overlay's own chrome can get baked into the screenshot ~ then hand
/// whatever `capture_fn` actually captured off to the editor.
///
/// The overlay is left hidden rather than destroyed (see `open_capture_overlay`),
/// so it's already loaded and styled the next time ~ recreating it from
/// scratch on every single capture was showing a full white flash each time.
fn finish_capture(app: &AppHandle, capture_fn: impl FnOnce() -> Result<Vec<u8>, String>) -> Result<(), String> {
    hide_capture_overlay(app)?;
    app.state::<AppState>().clear_freeze();
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
    // The overlay was showing a frozen copy of the screen, so the selection is
    // cropped from that copy: it is exactly what the user saw, it needs no
    // moment for the overlay to disappear first, and it already spans however
    // many monitors the selection touched.
    if let Some((_, desktop)) = app.state::<AppState>().freeze() {
        hide_capture_overlay(&app)?;
        app.state::<AppState>().clear_freeze();
        let cropped = desktop
            .crop(x, y, width, height)
            .ok_or_else(|| "the selection is outside the screen".to_string())?;
        let png = capture::encode_png(cropped)?;
        return open_editor_with_history(&app, png);
    }
    finish_capture(&app, || capture::capture_region(x, y, width, height))
}

#[tauri::command]
pub async fn finish_window_capture(app: AppHandle, window_id: u32) -> Result<(), String> {
    finish_capture(&app, || capture::capture_window(window_id))
}

#[tauri::command]
pub async fn cancel_capture(app: AppHandle) -> Result<(), String> {
    cancel_capture_overlay(&app)
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

/// Hands the editor the raw PNG bytes for a capture, keyed by the id its
/// `PendingCapture` carried.
///
/// Returns an `ipc::Response`, which crosses to the webview as raw bytes
/// (an `ArrayBuffer`) rather than JSON. The image used to travel base64'd
/// inside the capture event itself, which meant inflating it by a third,
/// JSON-escaping tens of megabytes, re-parsing that string in JS and
/// base64-decoding it again before decoding could even start. The frontend
/// now wraps these bytes in a blob URL instead ~ same-origin, so the canvas
/// stays untainted and Copy/Save keep working unchanged.
#[tauri::command]
pub fn take_capture_image(app: AppHandle, id: String) -> Result<tauri::ipc::Response, String> {
    let bytes = app
        .state::<AppState>()
        .capture_bytes(&id)
        .ok_or_else(|| format!("capture {id} is no longer available"))?;

    Ok(tauri::ipc::Response::new(bytes.as_ref().clone()))
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
    image_base64: String,
    suggested_name: String,
    format: ImageFormat,
) -> Result<Option<String>, String> {
    file_save::save_image(&app, &image_base64, &suggested_name, format)
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
    shapes_json: String,
    width: u32,
    height: u32,
) -> Result<(), String> {
    history::update_entry(&app, &id, &shapes_json, width, height)
}

/// Copies a stored capture straight to the clipboard, without opening it.
///
/// This is the *unannotated* capture ~ the pixels as taken. Annotations live
/// alongside it as shapes and are only rendered by the editor, so anything
/// drawn on a past capture is not included here. Open the entry to copy it
/// with its annotations.
#[tauri::command]
pub fn copy_history_entry(app: AppHandle, id: String) -> Result<(), String> {
    let entry = history::get_entry(&app, &id)?;
    clipboard::copy_png_bytes(&app, &entry.image_bytes)
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

/// False in the Store build, where the Store delivers updates and Shota's own
/// updater is compiled out. Settings uses it to say so instead of offering a
/// button that can't work.
#[tauri::command]
pub fn updates_supported() -> bool {
    cfg!(feature = "updater")
}

/// Same as the tray's "Check for Updates…": the result is reported in a
/// native dialog, so there is nothing to return.
#[tauri::command]
pub fn check_for_updates(app: AppHandle) {
    #[cfg(feature = "updater")]
    crate::updater::check_for_updates(&app, true);
    #[cfg(not(feature = "updater"))]
    let _ = app;
}

/// The desktop wallpaper's bytes, for the editor's background panel. Async
/// so reading a multi-megabyte file never blocks the main thread.
#[tauri::command]
pub async fn desktop_wallpaper() -> Result<tauri::ipc::Response, String> {
    crate::backgrounds::desktop_wallpaper().map(tauri::ipc::Response::new)
}

/// An image the user picked as a background.
#[tauri::command]
pub async fn read_background_image(path: String) -> Result<tauri::ipc::Response, String> {
    crate::backgrounds::read_image(&path).map(tauri::ipc::Response::new)
}

/// A file dropped on the editor. Async: converting a large JPEG to PNG is
/// real work, and the main thread is what keeps every window responsive.
#[tauri::command]
pub async fn open_image_file(app: AppHandle, path: String) -> Result<(), String> {
    crate::import::open_file(&app, std::path::Path::new(&path))
}

/// The editor's paste shortcut. `false` when the clipboard holds no image.
#[tauri::command]
pub async fn open_clipboard_image(app: AppHandle) -> Result<bool, String> {
    crate::import::open_clipboard(&app)
}

/// Drags the edited image out of the editor into another app. Synchronous on
/// purpose: Tauri runs those on the main thread, and the native drag loop has
/// to run on the thread that owns the window. It returns when the drag ends.
#[tauri::command]
pub fn drag_image_out(window: tauri::WebviewWindow, png_base64: String, name: String) -> Result<(), String> {
    crate::share_out::drag_out(&window, &png_base64, &name)
}

/// Opens the Windows Share sheet for the edited image. Async, so the main
/// thread is free to raise the sheet (see `share_out::share`).
#[tauri::command]
pub async fn share_image(
    app: AppHandle,
    window: tauri::WebviewWindow,
    png_base64: String,
    name: String,
) -> Result<(), String> {
    crate::share_out::share(&app, &window, &png_base64, &name)
}

/// What reading an area turned up.
#[derive(Serialize)]
pub struct TextCapture {
    /// `"qr"` (a QR code's content), `"text"` (recognised words) or `"none"`.
    pub kind: &'static str,
    pub text: String,
}

/// Copies the text, or the QR code's content, found in a selected area.
///
/// Reads from the frozen screen, like a picture capture does. A QR code is
/// tried first: it is exact, where text recognition is a good guess. Whatever
/// is found goes to the clipboard; nothing is copied when nothing is found.
/// The overlay stays open for the caller to show the answer in, and closes it.
#[tauri::command]
pub async fn finish_text_capture(app: AppHandle, x: i32, y: i32, width: u32, height: u32) -> Result<TextCapture, String> {
    let (_, desktop) = app
        .state::<AppState>()
        .freeze()
        .ok_or_else(|| "there is no frozen screen to read".to_string())?;
    let image = desktop
        .crop(x, y, width, height)
        .ok_or_else(|| "the selection is outside the screen".to_string())?;

    let found = tauri::async_runtime::spawn_blocking(move || -> Result<TextCapture, String> {
        if let Some(content) = crate::qr::decode_qr(&image) {
            return Ok(TextCapture { kind: "qr", text: content });
        }
        let text = crate::ocr::recognize_text(image)?;
        let text = text.trim().to_string();
        Ok(if text.is_empty() {
            TextCapture { kind: "none", text }
        } else {
            TextCapture { kind: "text", text }
        })
    })
    .await
    .map_err(|e| e.to_string())??;

    if found.kind != "none" {
        app.clipboard().write_text(found.text.clone()).map_err(|e| e.to_string())?;
    }
    Ok(found)
}

/// Captures the whole monitor under the cursor, from the frozen screen.
#[tauri::command]
pub async fn finish_fullscreen_capture(app: AppHandle) -> Result<(), String> {
    // From the frozen screen; or, when the overlay was opened over the live
    // one (the capture bar shortcut), from the screen as it is once the
    // overlay has gone.
    let desktop = match app.state::<AppState>().freeze() {
        Some((_, desktop)) => desktop,
        None => {
            hide_capture_overlay(&app)?;
            std::thread::sleep(std::time::Duration::from_millis(120));
            std::sync::Arc::new(capture::capture_desktop()?)
        }
    };

    let monitor = match app.cursor_position().ok().and_then(|p| app.monitor_from_point(p.x, p.y).ok().flatten()) {
        Some(monitor) => monitor,
        None => app
            .primary_monitor()
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "no monitor found".to_string())?,
    };
    let position = monitor.position();
    let size = monitor.size();

    hide_capture_overlay(&app)?;
    app.state::<AppState>().clear_freeze();
    let cropped = desktop
        .crop(position.x, position.y, size.width, size.height)
        .ok_or_else(|| "the monitor is outside the frozen screen".to_string())?;
    open_editor_with_history(&app, capture::encode_png(cropped)?)
}

/// Pins a selected area of the frozen screen, in place.
#[tauri::command]
pub async fn finish_pin_capture(app: AppHandle, x: i32, y: i32, width: u32, height: u32) -> Result<(), String> {
    let (_, desktop) = app
        .state::<AppState>()
        .freeze()
        .ok_or_else(|| "there is no frozen screen to pin".to_string())?;
    let cropped = desktop
        .crop(x, y, width, height)
        .ok_or_else(|| "the selection is outside the screen".to_string())?;
    let png = capture::encode_png(cropped)?;

    hide_capture_overlay(&app)?;
    app.state::<AppState>().clear_freeze();
    // The pin takes the spot the selection was in; the overlay was only ever
    // in the way, so the app the user was in gets the keyboard back.
    let handle = app.clone();
    app.run_on_main_thread(move || {
        if let Err(err) = open_pin(&handle, png, x, y) {
            eprintln!("could not pin the screenshot: {err}");
        }
        crate::windows::restore_foreground_after_pin();
    })
    .map_err(|e| e.to_string())
}

/// Pins the editor's current picture (a PNG, base64).
#[tauri::command]
pub async fn pin_image(app: AppHandle, png_base64: String) -> Result<(), String> {
    use base64::Engine;
    let png = base64::engine::general_purpose::STANDARD
        .decode(png_base64)
        .map_err(|e| e.to_string())?;
    let handle = app.clone();
    app.run_on_main_thread(move || {
        if let Err(err) = open_pin_centred(&handle, png) {
            eprintln!("could not pin the screenshot: {err}");
        }
    })
    .map_err(|e| e.to_string())
}

/// A pin's picture as raw PNG bytes, for its window to show.
#[tauri::command]
pub fn take_pin_image(app: AppHandle, id: u64) -> Result<tauri::ipc::Response, String> {
    let png = app
        .state::<AppState>()
        .pin_png(id)
        .ok_or_else(|| format!("pin {id} is gone"))?;
    Ok(tauri::ipc::Response::new(png.as_ref().clone()))
}

/// Copies a pin's picture to the clipboard.
#[tauri::command]
pub fn copy_pin_image(app: AppHandle, id: u64) -> Result<(), String> {
    let png = app
        .state::<AppState>()
        .pin_png(id)
        .ok_or_else(|| format!("pin {id} is gone"))?;
    clipboard::copy_png_bytes(&app, &png)
}

/// Saves the open capture and everything done to it as a `.shota` project:
/// asks where, writes it, and says where it went (`None` if cancelled).
/// `history_id` names the original picture on disk; `document_json` is the
/// editor's own saved document.
#[tauri::command]
pub fn save_project(
    app: AppHandle,
    history_id: String,
    document_json: String,
    suggested_name: String,
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;

    let original = history::get_entry(&app, &history_id)?.image_bytes;
    let text = crate::project::build(&original, &document_json, &app.package_info().version.to_string())?;

    let state = app.state::<AppState>();
    let directory = state
        .preferences()
        .save_dir
        .filter(|dir| std::path::Path::new(dir).is_dir())
        .or_else(|| state.last_save_dir())
        .or_else(|| app.path().desktop_dir().ok().map(|p| p.to_string_lossy().to_string()));

    let mut dialog = app
        .dialog()
        .file()
        .set_file_name(format!("{}.{}", suggested_name.trim(), crate::project::EXTENSION))
        .add_filter("Shota", &[crate::project::EXTENSION]);
    if let Some(directory) = &directory {
        dialog = dialog.set_directory(directory);
    }
    let Some(path) = dialog.blocking_save_file() else {
        return Ok(None);
    };
    let path = path.into_path().map_err(|e| e.to_string())?;
    std::fs::write(&path, text).map_err(|e| e.to_string())?;
    Ok(Some(path.to_string_lossy().to_string()))
}

/// The overlay's selection for a scrolling capture: put the overlay away, hand
/// the keyboard and the wheel back to the app underneath, and start.
#[tauri::command]
pub async fn finish_scroll_selection(app: AppHandle, x: i32, y: i32, width: u32, height: u32) -> Result<(), String> {
    let handle = app.clone();
    crate::scroll_capture::start(&app, crate::scroll_capture::Region { x, y, width, height }, move || {
        let _ = hide_capture_overlay(&handle);
        handle.state::<AppState>().clear_freeze();
        // The content has to receive the scrolling, not the overlay.
        crate::windows::restore_foreground_after_pin();
    })
}

/// The panel's "Done": stop scrolling and open what has been captured.
#[tauri::command]
pub fn finish_scroll_capture(app: AppHandle) {
    if let Some(session) = app.state::<AppState>().scroll_session() {
        session.finish.store(true, std::sync::atomic::Ordering::SeqCst);
    }
}

/// The panel's "Cancel": stop and throw it away.
#[tauri::command]
pub fn cancel_scroll_capture(app: AppHandle) {
    if let Some(session) = app.state::<AppState>().scroll_session() {
        session.cancel.store(true, std::sync::atomic::Ordering::SeqCst);
    }
}

/// The panel's "Auto-scroll": let Shota scroll the content (or hand it back).
#[tauri::command]
pub fn set_scroll_auto(app: AppHandle, enabled: bool) {
    if let Some(session) = app.state::<AppState>().scroll_session() {
        session.auto.store(enabled, std::sync::atomic::Ordering::SeqCst);
    }
}

/// Shows the calling window without taking the focus away from whatever is
/// being captured. The scrolling capture's backdrop and panel are built hidden
/// and revealed by their own page once it has painted, so a white, empty
/// window is never seen while the page loads.
#[tauri::command]
pub fn show_without_focus(window: tauri::WebviewWindow) {
    #[cfg(windows)]
    if let Ok(hwnd) = window.hwnd() {
        use windows::Win32::UI::WindowsAndMessaging::{ShowWindow, SW_SHOWNOACTIVATE};
        let _ = unsafe { ShowWindow(hwnd, SW_SHOWNOACTIVATE) };
    }
    #[cfg(not(windows))]
    let _ = window.show();
}

/// The overlay was opened over the live screen and the user chose a mode that
/// reads a still picture (text): freeze the screen now. The overlay steps out
/// of the way for the grab and comes back showing the frozen copy.
#[tauri::command]
pub async fn refreeze_overlay(app: AppHandle) -> Result<(), String> {
    crate::windows::refreeze_overlay(&app)
}
