use base64::Engine;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

/// Ctrl+Shift+6's carousel shows at most this many recent captures — older
/// ones are evicted (files deleted) as new ones come in.
const MAX_HISTORY: usize = 20;
const THUMB_MAX_SIDE: u32 = 320;

#[derive(Serialize, Deserialize, Clone)]
struct HistoryMeta {
    id: String,
    created_at: i64,
    width: u32,
    height: u32,
}

/// What the history carousel actually renders: a small thumbnail plus enough
/// metadata to lay it out, without paying to ship every full-size capture
/// over IPC just to draw a strip of thumbnails.
#[derive(Serialize, Clone)]
pub struct HistoryListItem {
    id: String,
    created_at: i64,
    width: u32,
    height: u32,
    thumbnail_base64: String,
}

/// What reopening a history entry in the editor needs: the editable base
/// image (never baked with annotations) plus whatever shapes were saved
/// against it last time, if any.
#[derive(Serialize, Clone)]
pub struct HistoryEntryPayload {
    pub image_base64: String,
    pub shapes_json: Option<String>,
    pub width: u32,
    pub height: u32,
}

pub struct HistoryState {
    entries: Mutex<Vec<HistoryMeta>>,
}

impl HistoryState {
    pub fn load(app: &AppHandle) -> Self {
        Self {
            entries: Mutex::new(read_index(app).unwrap_or_default()),
        }
    }
}

fn history_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("history");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn index_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(history_dir(app)?.join("index.json"))
}

fn image_path(app: &AppHandle, id: &str) -> Result<PathBuf, String> {
    Ok(history_dir(app)?.join(format!("{id}.png")))
}

fn thumb_path(app: &AppHandle, id: &str) -> Result<PathBuf, String> {
    Ok(history_dir(app)?.join(format!("{id}.thumb.png")))
}

fn shapes_path(app: &AppHandle, id: &str) -> Result<PathBuf, String> {
    Ok(history_dir(app)?.join(format!("{id}.shapes.json")))
}

fn read_index(app: &AppHandle) -> Option<Vec<HistoryMeta>> {
    let path = index_path(app).ok()?;
    let content = fs::read_to_string(path).ok()?;
    serde_json::from_str(&content).ok()
}

fn write_index(app: &AppHandle, entries: &[HistoryMeta]) -> Result<(), String> {
    let content = serde_json::to_string_pretty(entries).map_err(|e| e.to_string())?;
    fs::write(index_path(app)?, content).map_err(|e| e.to_string())
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Cheap and synchronous (just a timestamp), unlike the rest of history
/// persistence — callers on a latency-sensitive path (opening the editor)
/// can grab an id immediately and do the actual disk/image work later, in
/// the background, via `add_entry_with_id`.
pub fn new_id() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos().to_string())
        .unwrap_or_else(|_| "0".to_string())
}

fn write_thumbnail(app: &AppHandle, id: &str, img: &image::DynamicImage) -> Result<(), String> {
    let thumb = img.thumbnail(THUMB_MAX_SIDE, THUMB_MAX_SIDE);
    let mut bytes: Vec<u8> = Vec::new();
    thumb
        .write_to(&mut std::io::Cursor::new(&mut bytes), image::ImageFormat::Png)
        .map_err(|e| e.to_string())?;
    fs::write(thumb_path(app, id)?, bytes).map_err(|e| e.to_string())
}

/// Deletes every file on disk for entries beyond MAX_HISTORY (newest first).
fn prune(app: &AppHandle, entries: &mut Vec<HistoryMeta>) {
    entries.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    while entries.len() > MAX_HISTORY {
        if let Some(old) = entries.pop() {
            remove_entry_files(app, &old.id);
        }
    }
}

fn remove_entry_files(app: &AppHandle, id: &str) {
    if let Ok(p) = image_path(app, id) {
        let _ = fs::remove_file(p);
    }
    if let Ok(p) = thumb_path(app, id) {
        let _ = fs::remove_file(p);
    }
    if let Ok(p) = shapes_path(app, id) {
        let _ = fs::remove_file(p);
    }
}

/// Saves a freshly captured image as a new history entry (no annotations
/// yet), evicting the oldest entry past MAX_HISTORY. Takes an id the
/// caller already generated via `new_id` (e.g. to hand to the editor
/// window immediately) — decoding, thumbnailing and writing 2+ files to
/// disk is real work, meant to run in the background rather than block
/// whatever's waiting on the id.
pub fn add_entry_with_id(app: &AppHandle, id: &str, image_base64: &str) -> Result<(), String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(image_base64)
        .map_err(|e| e.to_string())?;
    let img = image::load_from_memory(&bytes).map_err(|e| e.to_string())?;

    fs::write(image_path(app, id)?, &bytes).map_err(|e| e.to_string())?;
    write_thumbnail(app, id, &img)?;

    let state = app.state::<HistoryState>();
    let mut entries = state.entries.lock().unwrap();
    // `update_entry` can race this and insert the same id first if the
    // editor closes very quickly after the capture — update in place
    // rather than pushing a duplicate in that case.
    match entries.iter_mut().find(|e| e.id == id) {
        Some(meta) => {
            meta.width = img.width();
            meta.height = img.height();
        }
        None => entries.push(HistoryMeta {
            id: id.to_string(),
            created_at: now_ms(),
            width: img.width(),
            height: img.height(),
        }),
    }
    prune(app, &mut entries);
    write_index(app, &entries)
}

/// Overwrites an existing entry's image + annotations, e.g. when the editor
/// closes after the user cropped the image or added shapes. Keeps the
/// original `created_at` so editing doesn't reorder the carousel.
pub fn update_entry(
    app: &AppHandle,
    id: &str,
    image_base64: &str,
    shapes_json: &str,
) -> Result<(), String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(image_base64)
        .map_err(|e| e.to_string())?;
    let img = image::load_from_memory(&bytes).map_err(|e| e.to_string())?;

    let state = app.state::<HistoryState>();
    let mut entries = state.entries.lock().unwrap();
    match entries.iter_mut().find(|e| e.id == id) {
        Some(meta) => {
            meta.width = img.width();
            meta.height = img.height();
        }
        // The editor can close (and race this in) before the capture's own
        // background `add_entry_with_id` has landed — create the entry here
        // instead of silently dropping the annotations in that case.
        None => entries.push(HistoryMeta {
            id: id.to_string(),
            created_at: now_ms(),
            width: img.width(),
            height: img.height(),
        }),
    }

    fs::write(image_path(app, id)?, &bytes).map_err(|e| e.to_string())?;
    write_thumbnail(app, id, &img)?;
    fs::write(shapes_path(app, id)?, shapes_json).map_err(|e| e.to_string())?;
    prune(app, &mut entries);
    write_index(app, &entries)
}

pub fn list_entries(app: &AppHandle) -> Result<Vec<HistoryListItem>, String> {
    let state = app.state::<HistoryState>();
    let mut entries = state.entries.lock().unwrap().clone();
    entries.sort_by(|a, b| b.created_at.cmp(&a.created_at));

    entries
        .into_iter()
        .map(|meta| {
            let bytes = fs::read(thumb_path(app, &meta.id)?).map_err(|e| e.to_string())?;
            Ok(HistoryListItem {
                id: meta.id,
                created_at: meta.created_at,
                width: meta.width,
                height: meta.height,
                thumbnail_base64: base64::engine::general_purpose::STANDARD.encode(bytes),
            })
        })
        .collect()
}

pub fn get_entry(app: &AppHandle, id: &str) -> Result<HistoryEntryPayload, String> {
    let state = app.state::<HistoryState>();
    let meta = {
        let entries = state.entries.lock().unwrap();
        entries
            .iter()
            .find(|e| e.id == id)
            .cloned()
            .ok_or_else(|| "history entry not found".to_string())?
    };

    let bytes = fs::read(image_path(app, id)?).map_err(|e| e.to_string())?;
    let image_base64 = base64::engine::general_purpose::STANDARD.encode(bytes);
    let shapes_json = fs::read_to_string(shapes_path(app, id)?).ok();

    Ok(HistoryEntryPayload {
        image_base64,
        shapes_json,
        width: meta.width,
        height: meta.height,
    })
}

pub fn delete_entry(app: &AppHandle, id: &str) -> Result<(), String> {
    let state = app.state::<HistoryState>();
    let mut entries = state.entries.lock().unwrap();
    entries.retain(|e| e.id != id);
    remove_entry_files(app, id);
    write_index(app, &entries)
}

pub fn clear(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<HistoryState>();
    let mut entries = state.entries.lock().unwrap();
    for entry in entries.iter() {
        remove_entry_files(app, &entry.id);
    }
    entries.clear();
    write_index(app, &entries)
}
