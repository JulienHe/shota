mod backgrounds;
mod capture;
mod clipboard;
mod commands;
mod explorer;
mod file_save;
mod fonts;
mod history;
mod hotkeys;
mod i18n;
mod import;
mod printscreen;
mod snapshot_hook;
mod startup;
mod state;
mod theme;
mod tray;
#[cfg(feature = "updater")]
mod updater;
mod windows;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        // First, as the plugin requires. A second launch (Explorer's "Edit
        // with Shota", or just starting Shota again) hands its arguments to
        // the copy already running and exits, instead of a second tray icon
        // fighting the first over every global shortcut.
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            if let Some(path) = image_argument(&argv, std::path::Path::new(&cwd)) {
                import::open_file_or_report(app, path);
            }
        }))
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_opener::init());

    #[cfg(feature = "updater")]
    let builder = builder.plugin(tauri_plugin_updater::Builder::new().build());

    builder
        .setup(|app| {
            let handle = app.handle().clone();
            app.manage(state::AppState::load(&handle));
            app.manage(history::HistoryState::load(&handle));
            hotkeys::register_all(&handle);
            theme::apply(&handle, handle.state::<state::AppState>().preferences().theme);
            // Captures past the age limit expire even on a day with no new
            // capture to trigger a prune. Off the main thread: it deletes files.
            let retention = handle.clone();
            std::thread::spawn(move || {
                let _ = history::apply_retention(&retention);
            });
            tray::build_tray(&handle).expect("failed to build tray icon");
            // Loads the capture overlay and editor windows right away so
            // the very first real capture of the session doesn't have to
            // bootstrap either page from scratch (white flash). The editor
            // uses DWM cloaking rather than the overlay's off-screen/hidden
            // trick ~ see prewarm_editor_window for why.
            windows::prewarm_capture_overlay(&handle);
            windows::prewarm_editor_window(&handle);
            // Started from Explorer with an image: open it. The editor was
            // just created above and picks the image up once it loads.
            let argv: Vec<String> = std::env::args().collect();
            if let Ok(cwd) = std::env::current_dir() {
                if let Some(path) = image_argument(&argv, &cwd) {
                    import::open_file_or_report(&handle, path);
                }
            }
            let menu = handle.clone();
            std::thread::spawn(move || explorer::apply(&menu));
            // Silent: a failed check at launch (no network, GitHub down)
            // should never greet someone with an error they didn't ask for.
            // The tray's "Check for Updates…" is the loud version.
            #[cfg(feature = "updater")]
            updater::check_for_updates(&handle, false);
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
            commands::print_screen_owned_by_snipping_tool,
            commands::desktop_wallpaper,
            commands::read_background_image,
            commands::default_shortcuts,
            commands::pause_global_shortcuts,
            commands::get_preferences,
            commands::set_preferences,
            commands::get_launch_at_startup,
            commands::set_launch_at_startup,
            commands::history_usage,
            commands::updates_supported,
            commands::check_for_updates,
            commands::release_print_screen,
            commands::get_locale,
            commands::get_language,
            commands::set_language,
            commands::supported_locales,
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
            commands::copy_history_entry,
            commands::delete_history_entry,
            commands::clear_history,
            commands::history_ready,
            commands::close_history_window_command,
            commands::open_image_file,
            commands::open_clipboard_image,
            commands::is_store_install,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// The image path in a command line, if there is one. Skips the program
/// itself, and resolves a relative path against the launching directory.
fn image_argument(argv: &[String], cwd: &std::path::Path) -> Option<std::path::PathBuf> {
    argv.iter()
        .skip(1)
        .map(|arg| cwd.join(arg))
        .find(|path| import::is_image_path(path) && path.is_file())
}
