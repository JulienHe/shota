use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_updater::UpdaterExt;

use crate::i18n;
use crate::state::AppState;

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
                report(&app, user_initiated, &err.to_string());
                return;
            }
        };

        match updater.check().await {
            Ok(Some(update)) => prompt_and_install(&app, update).await,
            Ok(None) => {
                if user_initiated {
                    let locale = app.state::<AppState>().locale();
                    let version = app.package_info().version.to_string();
                    info(
                        &app,
                        &i18n::t(&locale, "updater.upToDateTitle"),
                        &i18n::tf(&locale, "updater.upToDateBody", &[("version", &version)]),
                    );
                }
            }
            Err(err) => report(&app, user_initiated, &err.to_string()),
        }
    });
}

async fn prompt_and_install(app: &AppHandle, update: tauri_plugin_updater::Update) {
    let current = update.current_version.clone();
    let new = update.version.clone();

    let locale = app.state::<AppState>().locale();
    let accepted = app
        .dialog()
        .message(i18n::tf(
            &locale,
            "updater.availableBody",
            &[("version", &new), ("current", &current)],
        ))
        .title(i18n::t(&locale, "updater.availableTitle"))
        .kind(MessageDialogKind::Info)
        .buttons(MessageDialogButtons::OkCancelCustom(
            i18n::t(&locale, "updater.install"),
            i18n::t(&locale, "updater.notNow"),
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
            &i18n::t(&locale, "updater.failedTitle"),
            &i18n::tf(&locale, "updater.failedBody", &[("error", &err.to_string())]),
        );
        return;
    }

    // Only reached if the installer didn't already take over the process.
    app.restart();
}

/// Errors are worth interrupting someone for only when they asked the
/// question. A failed background check is logged and otherwise ignored.
fn report(app: &AppHandle, user_initiated: bool, message: &str) {
    eprintln!("update check failed: {message}");
    if user_initiated {
        let locale = app.state::<AppState>().locale();
        error(
            app,
            &i18n::t(&locale, "updater.checkFailedTitle"),
            &i18n::tf(&locale, "updater.checkFailedBody", &[("error", message)]),
        );
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
