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

## Releases must be signed, and an unsigned one fails silently

The updater verifies every downloaded installer against a minisign public key baked
into the installed app. That signature is produced at build time, and only if
`TAURI_SIGNING_PRIVATE_KEY_PATH` (or `..._KEY`) is in the environment.

Build without it and nothing complains: the installers are identical, the release page
looks normal, and the only symptom is that every installed copy quietly stops finding
updates — discovered whenever someone eventually notices they're several versions
behind. `scripts/release.mjs` refuses to build without a key and aborts if the `.sig`
is missing afterwards; use `npm run release` rather than `npm run tauri build` for
anything that gets published.

**The private key cannot be rotated.** Installed copies only trust the key compiled
into them, so losing it means no existing install can ever be updated again — every
user would have to find and run a new installer by hand. It lives outside the repo
(`~/.shota-signing/`), is gitignored by pattern, and belongs in a password manager.

Note this is minisign, entirely separate from Authenticode: it proves an update came
from whoever holds the key, and does nothing about SmartScreen, which is a separate
(paid) code-signing problem.

## Running a dev build alongside an installed one

Testing the updater needs a real install talking to a real release, which means
`tauri dev` has to coexist with an installed Shota. Three things collide otherwise,
and only one of them is obvious:

- **Global shortcuts** are held by one process at a time — whichever registers first
  wins and the other silently gets nothing. Debug builds use `Ctrl+Alt+Shift+3/4/6`
  (see `hotkeys.rs`, switched on `debug_assertions`).
- **Settings and history** live under the bundle identifier, so a dev build sharing
  it reads and writes the installed app's real capture history. `npm run tauri:dev`
  loads `tauri.dev.conf.json`, which overrides `identifier` and `productName` —
  without it, dev scribbles on production data.
- **The tray icon** is otherwise identical in both; the debug build's tooltip says
  "Shota (dev)".

Use `npm run tauri:dev`, not `npm run tauri dev`. The latter still works and is
occasionally what you want, but it shares the installed app's data directory.

## Authenticode signing must come before the updater signature

Once SignPath (or any code-signing certificate) is in the release pipeline, the order
of the two signatures is not interchangeable:

1. build the installer
2. Authenticode-sign it
3. **then** produce the updater's minisign signature (`tauri signer sign <file>`)

The updater's signature covers the installer's bytes. Authenticode signing rewrites
those bytes, so a signature taken first describes a file that no longer exists — and
every client rejects the update as tampered. Nothing warns about this: the build is
green, the release looks right, and updates simply fail verification on every machine.

This is why `bundle.createUpdaterArtifacts` is **false** and both the workflow and
`scripts/release.mjs` run `tauri signer sign` as a separate step after the build.
Turning it back on does not merely change where the signature is made: `tauri build`
then *requires* the signing key and fails without it, which forces the signature to be
produced during the build, which is the order that breaks.

## The Store build is a different build, not just a different package

`npm run msix` builds with `--no-default-features`, which compiles the updater out
entirely — plugin, tray entry and launch check. This is not optional: the Microsoft
Store updates apps itself and its policy requires that, and two update mechanisms
racing to install over each other is worse than either alone. Packaging a default
build would produce a package that fails review *and* misbehaves after install.

Verify with `cargo tree --no-default-features | grep tauri-plugin-updater` — it should
find nothing.

Two things that bit during setup and will again:

- `--no-default-features` is a cargo flag, so the Tauri CLI needs it after `--`
  (`tauri build --no-bundle -- --no-default-features`); passed directly it is rejected
  as an unknown argument.
- A capability naming a plugin that isn't compiled in is a hard build error, which is
  why `updater:default` is absent from `capabilities/`. It was never needed: the
  updater is driven from Rust, never from the webview.
