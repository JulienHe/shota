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
