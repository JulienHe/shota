mod capture;
mod clipboard;
mod commands;
mod file_save;
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
            hotkeys::register_all(&handle).expect("failed to register global shortcuts");
            tray::build_tray(&handle).expect("failed to build tray icon");
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
            commands::take_pending_image,
            commands::copy_image_to_clipboard,
            commands::save_image_as,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
