//! Getting the edited image out of Shota into something else: dragging it
//! onto another app's window or the desktop, and the Windows Share sheet.
//!
//! Both need the image as a *file* ~ a dropped file is what Slack, Explorer,
//! mail clients and browsers all accept ~ so the editor's export is written
//! to a temp folder first. The files are named like a save would name them, so
//! what lands in the destination has a sensible name, and swept after a day.

use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

use base64::Engine;
use tauri::{AppHandle, WebviewWindow};

const KEEP_FOR: Duration = Duration::from_secs(24 * 60 * 60);

/// Longest edge of the picture that follows the cursor while dragging.
const DRAG_PREVIEW_EDGE: u32 = 160;

fn staging_dir() -> PathBuf {
    std::env::temp_dir().join("Shota").join("outgoing")
}

/// Writes the exported PNG where another app can read it, and clears out
/// what earlier drags and shares left behind.
fn stage(png_base64: &str, name: &str) -> Result<(PathBuf, Vec<u8>), String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(png_base64)
        .map_err(|e| e.to_string())?;
    let dir = staging_dir();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    sweep(&dir);
    let path = dir.join(format!("{}.png", file_stem(name)));
    std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;
    Ok((path, bytes))
}

/// The user's file-name pattern can contain anything a title does; a path
/// can't. Same characters Windows refuses in a file name.
fn file_stem(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| if "<>:\"/\\|?*".contains(c) || c.is_control() { '-' } else { c })
        .collect();
    let cleaned = cleaned.trim().trim_end_matches('.').to_string();
    if cleaned.is_empty() {
        "Shota".to_string()
    } else {
        cleaned
    }
}

fn sweep(dir: &Path) {
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let old = entry
            .metadata()
            .and_then(|m| m.modified())
            .ok()
            .and_then(|modified| SystemTime::now().duration_since(modified).ok())
            .map(|age| age > KEEP_FOR)
            .unwrap_or(false);
        if old {
            let _ = std::fs::remove_file(entry.path());
        }
    }
}

/// A small PNG of the image for the drag cursor. The full capture would be
/// decoded and scaled by the shell on every mouse move.
fn drag_preview(png: &[u8]) -> Vec<u8> {
    let Ok(image) = image::load_from_memory(png) else {
        return Vec::new();
    };
    let small = image.thumbnail(DRAG_PREVIEW_EDGE, DRAG_PREVIEW_EDGE);
    let mut out = Vec::new();
    let _ = small.write_to(&mut std::io::Cursor::new(&mut out), image::ImageFormat::Png);
    out
}

/// Starts a native drag of the image and returns when it is dropped or
/// cancelled. Blocks, and has to run on the main thread (the drag loop is
/// the window's own); a synchronous Tauri command is exactly that.
pub fn drag_out(window: &WebviewWindow, png_base64: &str, name: &str) -> Result<(), String> {
    let (path, bytes) = stage(png_base64, name)?;
    let preview = drag_preview(&bytes);
    drag::start_drag(
        window,
        drag::DragItem::Files(vec![path]),
        drag::Image::Raw(preview),
        |_, _| {},
        drag::Options::default(),
    )
    .map_err(|e| e.to_string())
}

/// Opens the Windows Share sheet for the image.
pub fn share(app: &AppHandle, window: &WebviewWindow, png_base64: &str, name: &str) -> Result<(), String> {
    let (path, _) = stage(png_base64, name)?;
    imp::show(app, window, &path, &file_stem(name))
}

#[cfg(windows)]
mod imp {
    use std::path::Path;
    use std::cell::RefCell;

    use tauri::{AppHandle, WebviewWindow};
    use windows::core::{factory, Interface, HSTRING};
    use windows::ApplicationModel::DataTransfer::{
        DataRequestedEventArgs, DataTransferManager,
    };
    use windows_collections::IIterable;
    use windows::Foundation::TypedEventHandler;
    use windows::Storage::Streams::RandomAccessStreamReference;
    use windows::Storage::{IStorageItem, StorageFile};
    use windows::Win32::Foundation::HWND;
    use windows::Win32::System::WinRT::{RoInitialize, RO_INIT_MULTITHREADED};
    use windows::Win32::UI::Shell::IDataTransferManagerInterop;

    // The handler from the previous share, main thread only (where shares are
    // raised). `GetForWindow` hands back the same manager each time, so handlers
    // pile up (one share would send the image once per earlier share) unless
    // the old one is removed first.
    thread_local! {
        static PREVIOUS: RefCell<Option<(DataTransferManager, i64)>> = const { RefCell::new(None) };
    }

    pub fn show(app: &AppHandle, window: &WebviewWindow, path: &Path, title: &str) -> Result<(), String> {
        let raw_hwnd = window.hwnd().map_err(|e| e.to_string())?.0 as isize;
        let path = path.to_path_buf();
        let title = HSTRING::from(title);
        let (tx, rx) = std::sync::mpsc::channel::<Result<(), String>>();

        // The share sheet belongs to the window, so it is raised from the
        // thread that owns the window.
        app.run_on_main_thread(move || {
            let hwnd = HWND(raw_hwnd as *mut core::ffi::c_void);
            let result = (|| -> windows::core::Result<()> {
                let interop = factory::<DataTransferManager, IDataTransferManagerInterop>()?;
                let manager: DataTransferManager = unsafe { interop.GetForWindow(hwnd)? };

                if let Some((old, token)) = PREVIOUS.with(|p| p.borrow_mut().take()) {
                    let _ = old.RemoveDataRequested(token);
                }

                let token = manager.DataRequested(&TypedEventHandler::new(
                    move |_, args: windows::core::Ref<DataRequestedEventArgs>| {
                        let Some(args) = args.as_ref() else { return Ok(()) };
                        let request = args.Request()?;
                        let data = request.Data()?;
                        data.Properties()?.SetTitle(&title)?;
                        // Resolving the file is asynchronous. A deferral keeps
                        // the sheet waiting for it, and a worker thread does the
                        // waiting so this thread keeps pumping messages.
                        let deferral = request.GetDeferral()?;
                        let path = path.clone();
                        std::thread::spawn(move || {
                            let _ = unsafe { RoInitialize(RO_INIT_MULTITHREADED) };
                            let attach = || -> windows::core::Result<()> {
                                let file = StorageFile::GetFileFromPathAsync(&HSTRING::from(path.as_os_str()))?.get()?;
                                let items: Vec<Option<IStorageItem>> = vec![Some(file.cast()?)];
                                let items: IIterable<IStorageItem> = items.into();
                                data.SetStorageItems(&items, true)?;
                                data.SetBitmap(&RandomAccessStreamReference::CreateFromFile(&file)?)?;
                                Ok(())
                            };
                            if let Err(err) = attach() {
                                eprintln!("preparing the shared image failed: {err}");
                            }
                            let _ = deferral.Complete();
                        });
                        Ok(())
                    },
                ))?;
                PREVIOUS.with(|p| *p.borrow_mut() = Some((manager, token)));

                unsafe { interop.ShowShareUIForWindow(hwnd) }
            })();
            let _ = tx.send(result.map_err(|e| e.to_string()));
        })
        .map_err(|e| e.to_string())?;

        rx.recv().map_err(|e| e.to_string())?
    }
}

#[cfg(not(windows))]
mod imp {
    use std::path::Path;

    use tauri::{AppHandle, WebviewWindow};

    pub fn show(_app: &AppHandle, _window: &WebviewWindow, _path: &Path, _title: &str) -> Result<(), String> {
        Err("sharing is only available on Windows".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn file_stem_replaces_what_windows_refuses() {
        assert_eq!(file_stem("Shota 2026-10-15 10:30"), "Shota 2026-10-15 10-30");
        assert_eq!(file_stem("a/b\\c?"), "a-b-c-");
        assert_eq!(file_stem("  "), "Shota");
        assert_eq!(file_stem("name."), "name");
    }
}
