use tauri::AppHandle;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_updater::UpdaterExt;

/// Update checking, driven entirely from Rust.
///
/// Shota has no main window — it lives in the tray, and the windows it does
/// own are a capture overlay, an editor and a history strip, none of which
/// is a sensible host for "a new version is available". Running the whole
/// flow here means the updater never needs a webview to exist, so a check
/// can happen at launch whether or not the user has captured anything.

/// Checks for an update and, if the user agrees, installs it and restarts.
///
/// `user_initiated` controls how loud the no-op cases are: the tray's
/// "Check for Updates…" has to say *something* when the app is already
/// current or the network is down, while the automatic check at launch
/// stays silent so a flaky connection never greets the user with an error
/// they didn't ask for.
pub fn check_for_updates(app: &AppHandle, user_initiated: bool) {
    let app = app.clone();
    // Spawned because downloading and installing are long-running, and this
    // is called from the tray's menu handler, which runs on the main thread
    // — blocking it would freeze the tray menu and every window with it.
    tauri::async_runtime::spawn(async move {
        let updater = match app.updater() {
            Ok(updater) => updater,
            Err(err) => {
                report(&app, user_initiated, &format!("Could not check for updates: {err}"));
                return;
            }
        };

        match updater.check().await {
            Ok(Some(update)) => prompt_and_install(&app, update).await,
            Ok(None) => {
                if user_initiated {
                    let version = app.package_info().version.to_string();
                    info(&app, "Shota is up to date", &format!("You're on version {version}."));
                }
            }
            Err(err) => report(&app, user_initiated, &format!("Could not check for updates: {err}")),
        }
    });
}

async fn prompt_and_install(app: &AppHandle, update: tauri_plugin_updater::Update) {
    let current = update.current_version.clone();
    let new = update.version.clone();

    let accepted = app
        .dialog()
        .message(format!(
            "Shota {new} is available — you have {current}.\n\nShota will restart once it's installed."
        ))
        .title("Update available")
        .kind(MessageDialogKind::Info)
        .buttons(MessageDialogButtons::OkCancelCustom(
            "Install and restart".to_string(),
            "Not now".to_string(),
        ))
        .blocking_show();

    if !accepted {
        return;
    }

    // The closures report download progress; nothing consumes them yet, but
    // the API requires them and they're the hook for a progress UI later.
    if let Err(err) = update.download_and_install(|_chunk, _total| {}, || {}).await {
        error(
            app,
            "Update failed",
            &format!("Shota couldn't install the update: {err}\n\nYou can download it manually from the releases page."),
        );
        return;
    }

    // Only reached if the installer didn't already take over the process.
    app.restart();
}

/// Errors are worth interrupting someone for only when they asked the
/// question. A failed background check is logged and otherwise ignored.
fn report(app: &AppHandle, user_initiated: bool, message: &str) {
    eprintln!("{message}");
    if user_initiated {
        error(app, "Update check failed", message);
    }
}

fn info(app: &AppHandle, title: &str, message: &str) {
    app.dialog()
        .message(message)
        .title(title)
        .kind(MessageDialogKind::Info)
        .blocking_show();
}

fn error(app: &AppHandle, title: &str, message: &str) {
    app.dialog()
        .message(message)
        .title(title)
        .kind(MessageDialogKind::Error)
        .blocking_show();
}
