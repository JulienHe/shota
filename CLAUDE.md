# Shota — engineering guardrails

## Never block a latency-sensitive path on disk/image I/O

Decoding a PNG, generating a thumbnail, or writing files to disk is real work (tens to
hundreds of ms, more for large screenshots) — never put it directly in a path the user
is actively waiting on:

- **Capture → editor open**: the editor must open with the raw captured image immediately.
  Anything else (history entry, thumbnail, disk writes) happens on a background thread
  afterward.
- **Copy / Save → window close**: the window must close immediately. Persisting state
  (e.g. history annotations) back to disk happens as a fire-and-forget call — don't
  `event.preventDefault()` + `await` it before actually closing.

Concretely: generate any id needed by the fast path synchronously (cheap — e.g. a
timestamp), hand it out immediately, and do the actual slow work (`image::load_from_memory`,
thumbnailing, `fs::write`) in a spawned thread keyed by that id.

**Why this is written down**: this exact mistake shipped once already — history-entry
persistence was added inline in both the capture→editor path and the editor-close path,
and it took "capture takes 1 second" / "copy takes 1-2 seconds" user reports before it was
caught. See `src-tauri/src/windows/editor.rs` (`open_editor_with_history`) and
`src-tauri/src/history.rs` (`new_id` / `add_entry_with_id`) for the fixed pattern.

## Window reuse and per-mount state

Some windows (capture overlay, editor) are reused across invocations — hidden/repositioned
rather than destroyed and recreated — to avoid a visible reload/flash on every use. Any
frontend state captured "once on mount" (e.g. `useEffect(() => {...}, [])` reading the
window's on-screen position) will go stale the first time the window is reused, since the
React tree never remounts. If a value can change between reuses, subscribe to the Tauri
event that reflects the change (e.g. `onMoved`) instead of reading it once.

## Check the build profile before chasing "the app feels slow"

Cargo's default dev profile is `opt-level = 0`, and that applies to dependencies too.
For anything pixel-pushing (`xcap`'s capture, `image`/`png`'s encoder) that's not a
small penalty — measured on a 3840x2160 capture, the Rust half of Ctrl+Shift+3 took
**~1990ms unoptimized vs ~234ms optimized**:

| stage | `opt-level = 0` | optimized deps |
| --- | --- | --- |
| `monitor.capture_image()` | 645 ms | 103 ms |
| PNG encode (Fast/NoFilter) | 827 ms | 90 ms |
| JSON-escaping the payload | 461 ms | 28 ms |
| thumbnail (background) | 512 ms | 12 ms |

`[profile.dev.package."*"] opt-level = 3` in `src-tauri/Cargo.toml` fixes it. This only
ever affected `tauri dev` — release builds were always optimized — so it presents as
"the app is broken" during development while the shipped binary is fine.

**Measure before optimizing.** This was found by timing each stage in a throwaway crate
against the real dependencies, not by reading code and guessing. Two things that
*looked* like obvious culprits (xcap's capture, the 120ms overlay sleep) were nowhere
near the real cost.

**Changing opt-level invalidates incremental artifacts.** If a build starts failing with
`unresolved external symbol anon.*.llvm.*` link errors after touching profile settings,
`rm -rf src-tauri/target/debug/incremental` — it is not a code error.

## Large images must not cross IPC as base64

A capture reaches the editor as raw PNG bytes: Rust holds them in `AppState` keyed by an
id, the `shota://new-capture` event carries only that id, and the frontend fetches the
bytes via `take_capture_image`, which returns a `tauri::ipc::Response` (arrives in JS as
an `ArrayBuffer`) and wraps them in a `blob:` URL.

Do not "simplify" this back to base64-in-the-event. That inflates the payload by a third,
JSON-escapes tens of megabytes, forces a `JSON.parse` of that string in the webview,
builds a second multi-MB data-URL string, then base64-decodes it — roughly a second of
work per capture, on top of the Rust side.

`blob:` URLs specifically, not a custom URI scheme: blob URLs are same-origin, so the
Konva canvas stays untainted and `stage.toDataURL()` (Copy/Save) keeps working. A custom
protocol origin would taint the canvas and break export unless CORS is set up exactly right.

Same rule applies on the way back out: the editor sends only `shapes_json` on close, never
the image. The base image never changes there, and Rust already wrote those exact pixels
to disk at capture time.

## A pre-warmed window is not a ready window

`prewarm_capture_overlay` / `prewarm_editor_window` return as soon as the window
*object* exists — loading the page and mounting React happens afterwards, on the
webview's own schedule. Anything that reveals one of these windows has to gate on
the frontend having signalled readiness (`overlay_ready` / `editor_ready`), not on
the window merely existing.

Revealing too early is worse than it sounds for the overlay specifically: it is
full-screen, always-on-top and transparent, so an empty one is an invisible
click-swallowing sheet over the whole desktop — and `Esc` can't dismiss it,
because that handler lives in the JS that hasn't run yet. `AppState::overlay_ready`
tracks this; `open_capture_overlay` positions the window but leaves it cloaked
until the page mounts, and `show_capture_overlay` performs the reveal instead.

Symptom to recognise: "I pressed the shortcut and got an overlay with nothing in
it", usually shortly after launch or on a loaded machine.
