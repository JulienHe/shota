mod capture;
mod clipboard;
mod commands;
mod file_save;
mod hotkeys;
mod state;
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
            hotkeys::register_shortcuts(&handle).expect("failed to register global shortcuts");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_capturable_windows,
            commands::open_capture_overlay_command,
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
