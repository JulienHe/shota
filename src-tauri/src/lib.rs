mod capture;
mod clipboard;
mod commands;
mod file_save;
mod fonts;
mod history;
mod hotkeys;
mod state;
mod tray;
mod windows;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let handle = app.handle().clone();
            app.manage(state::AppState::load(&handle));
            app.manage(history::HistoryState::load(&handle));
            hotkeys::register_all(&handle).expect("failed to register global shortcuts");
            hotkeys::register_history_shortcut(&handle).expect("failed to register history shortcut");
            tray::build_tray(&handle).expect("failed to build tray icon");
            // Loads the capture overlay and editor windows right away so
            // the very first real capture of the session doesn't have to
            // bootstrap either page from scratch (white flash). The editor
            // uses DWM cloaking rather than the overlay's off-screen/hidden
            // trick — see prewarm_editor_window for why.
            windows::prewarm_capture_overlay(&handle);
            windows::prewarm_editor_window(&handle);
            Ok(())
        })
        .on_window_event(|window, event| {
            // shota lives in the tray; closing the shortcuts window just hides it
            // instead of quitting the whole app.
            if window.label() == "main" {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_capturable_windows,
            commands::open_capture_overlay_command,
            commands::overlay_ready,
            commands::get_shortcuts,
            commands::set_shortcut,
            commands::finish_region_capture,
            commands::finish_window_capture,
            commands::cancel_capture,
            commands::capture_fullscreen_now,
            commands::take_pending_capture,
            commands::take_capture_image,
            commands::editor_ready,
            commands::close_editor_window,
            commands::copy_image_to_clipboard,
            commands::save_image_as,
            commands::list_system_fonts,
            commands::list_history,
            commands::open_history_entry,
            commands::update_history_entry,
            commands::delete_history_entry,
            commands::clear_history,
            commands::history_ready,
            commands::close_history_window_command,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
