# Shota ~ engineering guardrails

## Never block a latency-sensitive path on disk/image I/O

Decoding a PNG, generating a thumbnail, or writing files to disk is real work (tens to
hundreds of ms, more for large screenshots) ~ never put it directly in a path the user
is actively waiting on:

- **Capture → editor open**: the editor must open with the raw captured image immediately.
  Anything else (history entry, thumbnail, disk writes) happens on a background thread
  afterward.
- **Copy / Save → window close**: the window must close immediately. Persisting state
  (e.g. history annotations) back to disk happens as a fire-and-forget call ~ don't
  `event.preventDefault()` + `await` it before actually closing.

Concretely: generate any id needed by the fast path synchronously (cheap ~ e.g. a
timestamp), hand it out immediately, and do the actual slow work (`image::load_from_memory`,
thumbnailing, `fs::write`) in a spawned thread keyed by that id.

**Why this is written down**: this exact mistake shipped once already ~ history-entry
persistence was added inline in both the capture→editor path and the editor-close path,
and it took "capture takes 1 second" / "copy takes 1-2 seconds" user reports before it was
caught. See `src-tauri/src/windows/editor.rs` (`open_editor_with_history`) and
`src-tauri/src/history.rs` (`new_id` / `add_entry_with_id`) for the fixed pattern.

## Window reuse and per-mount state

Some windows (capture overlay, editor) are reused across invocations ~ hidden/repositioned
rather than destroyed and recreated ~ to avoid a visible reload/flash on every use. Any
frontend state captured "once on mount" (e.g. `useEffect(() => {...}, [])` reading the
window's on-screen position) will go stale the first time the window is reused, since the
React tree never remounts. If a value can change between reuses, subscribe to the Tauri
event that reflects the change (e.g. `onMoved`) instead of reading it once.

## Check the build profile before chasing "the app feels slow"

Cargo's default dev profile is `opt-level = 0`, and that applies to dependencies too.
For anything pixel-pushing (`xcap`'s capture, `image`/`png`'s encoder) that's not a
small penalty ~ measured on a 3840x2160 capture, the Rust half of Ctrl+Shift+3 took
**~1990ms unoptimized vs ~234ms optimized**:

| stage | `opt-level = 0` | optimized deps |
| --- | --- | --- |
| `monitor.capture_image()` | 645 ms | 103 ms |
| PNG encode (Fast/NoFilter) | 827 ms | 90 ms |
| JSON-escaping the payload | 461 ms | 28 ms |
| thumbnail (background) | 512 ms | 12 ms |

`[profile.dev.package."*"] opt-level = 3` in `src-tauri/Cargo.toml` fixes it. This only
ever affected `tauri dev` ~ release builds were always optimized ~ so it presents as
"the app is broken" during development while the shipped binary is fine.

**Measure before optimizing.** This was found by timing each stage in a throwaway crate
against the real dependencies, not by reading code and guessing. Two things that
*looked* like obvious culprits (xcap's capture, the 120ms overlay sleep) were nowhere
near the real cost.

**Changing opt-level invalidates incremental artifacts.** If a build starts failing with
`unresolved external symbol anon.*.llvm.*` link errors after touching profile settings,
`rm -rf src-tauri/target/debug/incremental` ~ it is not a code error.

## Large images must not cross IPC as base64

A capture reaches the editor as raw PNG bytes: Rust holds them in `AppState` keyed by an
id, the `shota://new-capture` event carries only that id, and the frontend fetches the
bytes via `take_capture_image`, which returns a `tauri::ipc::Response` (arrives in JS as
an `ArrayBuffer`) and wraps them in a `blob:` URL.

Do not "simplify" this back to base64-in-the-event. That inflates the payload by a third,
JSON-escapes tens of megabytes, forces a `JSON.parse` of that string in the webview,
builds a second multi-MB data-URL string, then base64-decodes it ~ roughly a second of
work per capture, on top of the Rust side.

`blob:` URLs specifically, not a custom URI scheme: blob URLs are same-origin, so the
Konva canvas stays untainted and `stage.toDataURL()` (Copy/Save) keeps working. A custom
protocol origin would taint the canvas and break export unless CORS is set up exactly right.

Same rule applies on the way back out: the editor sends only `shapes_json` on close, never
the image. The base image never changes there, and Rust already wrote those exact pixels
to disk at capture time.

## A pre-warmed window is not a ready window

`prewarm_capture_overlay` / `prewarm_editor_window` return as soon as the window
*object* exists ~ loading the page and mounting React happens afterwards, on the
webview's own schedule. Anything that reveals one of these windows has to gate on
the frontend having signalled readiness (`overlay_ready` / `editor_ready`), not on
the window merely existing.

Revealing too early is worse than it sounds for the overlay specifically: it is
full-screen, always-on-top and transparent, so an empty one is an invisible
click-swallowing sheet over the whole desktop ~ and `Esc` can't dismiss it,
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
updates ~ discovered whenever someone eventually notices they're several versions
behind. `scripts/release.mjs` refuses to build without a key and aborts if the `.sig`
is missing afterwards; use `npm run release` rather than `npm run tauri build` for
anything that gets published.

**The private key cannot be rotated.** Installed copies only trust the key compiled
into them, so losing it means no existing install can ever be updated again ~ every
user would have to find and run a new installer by hand. It lives outside the repo
(`~/.shota-signing/`), is gitignored by pattern, and belongs in a password manager.

Note this is minisign, entirely separate from Authenticode: it proves an update came
from whoever holds the key, and does nothing about SmartScreen, which is a separate
(paid) code-signing problem.

## Running a dev build alongside an installed one

Testing the updater needs a real install talking to a real release, which means
`tauri dev` has to coexist with an installed Shota. Three things collide otherwise,
and only one of them is obvious:

- **Global shortcuts** are held by one process at a time ~ whichever registers first
  wins and the other silently gets nothing. Debug builds default to `Ctrl+Alt+3/4/5`
  (see `hotkeys.rs`, switched on `debug_assertions`).
- **Settings and history** live under the bundle identifier, so a dev build sharing
  it reads and writes the installed app's real capture history. `npm run tauri:dev`
  loads `tauri.dev.conf.json`, which overrides `identifier` and `productName` ~
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
those bytes, so a signature taken first describes a file that no longer exists ~ and
every client rejects the update as tampered. Nothing warns about this: the build is
green, the release looks right, and updates simply fail verification on every machine.

This is why `bundle.createUpdaterArtifacts` is **false** and both the workflow and
`scripts/release.mjs` run `tauri signer sign` as a separate step after the build.
Turning it back on does not merely change where the signature is made: `tauri build`
then *requires* the signing key and fails without it, which forces the signature to be
produced during the build, which is the order that breaks.

## The Store build is a different build, not just a different package

`npm run msix` builds with `--no-default-features`, which compiles the updater out
entirely ~ plugin, tray entry and launch check. This is not optional: the Microsoft
Store updates apps itself and its policy requires that, and two update mechanisms
racing to install over each other is worse than either alone. Packaging a default
build would produce a package that fails review *and* misbehaves after install.

Verify with `cargo tree --no-default-features | grep tauri-plugin-updater` ~ it should
find nothing.

Two things that bit during setup and will again:

- `--no-default-features` is a cargo flag, so the Tauri CLI needs it after `--`
  (`tauri build --no-bundle -- --no-default-features`); passed directly it is rejected
  as an unknown argument.
- A capability naming a plugin that isn't compiled in is a hard build error, which is
  why `updater:default` is absent from `capabilities/`. It was never needed: the
  updater is driven from Rust, never from the webview.

## One translation catalogue, read by both halves

`locales/*.json` is the single source of UI strings. Rust compiles them in with
`include_str!` for the tray menu and the updater dialogs; the frontend imports the same
files. Do not add a second catalogue for either side ~ the tray saying "Quitter Shota"
while the editor says "Close" is the failure this prevents, and nothing would catch it.

Adding a string means adding it to `en.json` first; every other locale is verified
against English key-for-key, and a missing key falls back to English rather than
rendering the key. A *wrong* key renders as the key itself, so the two failures look
different on purpose.

Adding a language means a new `locales/<tag>.json`, an entry in `SUPPORTED` in
`i18n.rs`, an import in `i18n.ts`, a name in `LANGUAGE_NAMES`, and a `<Resource
Language>` line in the MSIX manifest. Miss the last one and the Store never tells that
market the app speaks its language.

Locale resolution lives in Rust so the native menus and the webview cannot disagree:
the frontend asks for the resolved tag at startup and renders nothing until it has it.
Changing the language reloads the window, because the tray menu is built once at startup
and the other windows are long-lived and reused ~ re-rendering one view would leave most
of the app in the previous language.

## Print Screen is the default capture key, and Windows may be holding it

Shota's default shortcuts follow Windows convention, not macOS: `PrintScreen` for
region, `Ctrl+PrintScreen` for full screen, `Shift+PrintScreen` for history. The
previous `Ctrl+Shift+3/4` were `Cmd+Shift+3/4` carried over from macOS, which nobody
on Windows reaches for. Every established Windows tool puts capture on Print Screen,
and puts *region* there rather than full screen.

Windows 11 binds Print Screen to the Snipping Tool by default, and that binding can
swallow the press before Shota sees it, silently. `RegisterHotKey` still succeeds for
`VK_SNAPSHOT` (verified: registering it returns true rather than
`ERROR_HOTKEY_ALREADY_REGISTERED`, so the Snipping Tool's binding is not a competing
RegisterHotKey), but succeeding at registration is not the same as receiving the key.

`printscreen.rs` reads `HKCU\Control Panel\Keyboard\PrintScreenKeyForSnippingEnabled`
to detect it and can clear it on request. An **absent** value counts as taken, because
Windows 11 treats absent as enabled, which is exactly the clean-install case. The value
is per-user, so clearing it needs no elevation ~ but it is still the user's machine, so
it only ever happens behind a button in settings, never automatically.

Changing these defaults is safe for existing users: shortcuts persist in settings.json
and the defaults only apply to a fresh install.

## Launch at startup has two mechanisms, picked at runtime

`startup.rs` checks whether *this copy* is running from an MSIX package
(`GetCurrentPackageFullName`), not which build feature it was compiled with:

- **Unpackaged (GitHub installer):** a value under `HKCU\...\CurrentVersion\Run`.
- **Packaged (Store):** the `windows.startupTask` in `AppxManifest.xml`, toggled with the
  WinRT `StartupTask` API. A packaged app's writes to the `Run` key are virtualized into
  the package and never read at sign-in, so the registry route silently does nothing there.

The manifest's `TaskId` and `STORE_TASK_ID` in `startup.rs` must match exactly; a mismatch
fails at runtime, not at build or review. Task Manager's Startup apps switch overrides both:
the registry path clears it when the user turns startup on in Shota (they asked), but the
Store API refuses to override `DisabledByUser`, so settings says where to turn it back on.

## Settings reach long-lived windows by event, never by reading once

Preferences (theme, save format, editor shortcuts, history retention) are one object,
`Preferences` in `state.rs`, saved with `set_preferences`, which applies whatever changed and
emits `shota://preferences-changed`. `preferencesStore.ts` loads it once per window and then
follows that event. The editor is created once and reused for every capture (see "Window
reuse" above), so anything it read only on mount would stay stale until a restart.

Editor shortcut *defaults* live in `src/lib/editorShortcuts.ts`; settings stores overrides
only. An action added later gets its default with no migration, and "reset" deletes the
override rather than writing the default down.

## Recording a shortcut pauses the global ones

While the settings window records a shortcut, every global hotkey is unregistered
(`pause_global_shortcuts`) and re-registered afterwards. Otherwise pressing a combination Shota
already owns fires it (rebinding Print Screen would start a capture), and Windows delivers a
registered hotkey to its owner rather than the focused window, so the recorder never sees it.

Print Screen reaches the webview as `keyup` only; Windows never delivers its `keydown`. The
recorder listens for both for that reason.

`register_all` logs and skips a shortcut that fails to register instead of failing the rest.
It used to `expect()`, so a shortcut another app had since claimed crashed Shota on every launch.

## Frames change what "the document" is

A frame (background, padding, corners, shadow; `src/features/background/`) extends the
exported image past the screenshot on every side, so its bounds start at *negative* image
coordinates. Three things follow, and each was a real bug to avoid:

- **Export renders the frame's bounds, not the image's.** `performExport` sets the stage to
  1:1 and offsets it to the content box for the duration of one synchronous `toDataURL`,
  then restores the view. The older "ask for the on-screen region and scale it back up"
  approach derived one pixelRatio from the rounded width, so the height drifted by a pixel
  or two. Unframed exports must stay exactly the capture's size.
- **Fitting and centring use the content box** (`centeredBoxView`), not the image, or a
  framed capture is fitted as if the padding weren't there.
- **History stores `{ version: 2, shapes, frame }`.** Older entries are a bare shapes array;
  `parseDocument` reads both. Never write the bare array again, or reopening drops the frame.

New captures always start without a frame. 0.6.0 applied the last frame to every new capture;
that put backgrounds on screenshots nobody meant to frame, and it was taken out. Only the slider
values carry over (`lastSliders`), so the usual look is one click away without being imposed.

Wallpaper and picked-image backgrounds are stored by reference (`wallpaper`, or a path) and
re-read when shown, never embedded in history.

## Version numbers

`0.MINOR.PATCH`, chosen by what a release contains:

- **PATCH** (0.6.0 → 0.6.1): fixes, polish, translations, dependency and security updates.
  Anything a user wouldn't describe as "a new feature".
- **MINOR** (0.6.x → 0.7.0): a new feature or a visible change in behaviour.
- **1.0** is a deliberate decision, never the next number after 0.9: 0.9 is followed by 0.10.
  Both the updater (semver) and the Store (numeric parts) order 0.10 after 0.9 correctly.

The version lives in three files that must match: `package.json`, `src-tauri/tauri.conf.json`
and `src-tauri/Cargo.toml`. Bump them together, then let npm and cargo update their lockfiles
(`npm install --package-lock-only`, any `cargo check`) rather than editing lockfiles by hand.

## Store releases go through `npm run store`

The Partner Center account is an **individual** developer account, which can't get API access
(no "Microsoft Entra applications" tab; confirmed by Microsoft's own docs on user management and
an unanswered report from another individual developer, October 2026). So the working route is
`npm run store -- --csv <export.csv>`: fill Partner Center's listing export from
`docs/store-listing/listings.json` and import it by hand. Don't spend time trying to make the CLI
authenticate on this account.

The CLI route below exists for a company account and has never run against the live API.
`scripts/store.mjs` drives Microsoft's `msstore` CLI: upload the MSIX as a draft, read the
submission back, write every language's text from `docs/store-listing/listings.json` into it,
send it back, submit. Things that will bite if changed:

- **`msstore publish` before any listing edit.** With a published submission, `publish`
  discards the draft and starts a new one from the last published submission, so edits made
  before it are silently lost.
- **The submission goes back as a file path, not an argument.** Fifteen listings are far past
  Windows' 32k command line; `submission updateMetadata` accepts a path.
- **Only text and captions are written.** Image entries refer to files Partner Center already
  holds; rewriting them risks detaching the files. A listing with no screenshot borrows the
  English ones, because a listing without one fails submission.
- **The CLI's JSON is PascalCase**, and `applyListings` keeps whatever casing it is given.
- **No URLs in descriptions** (Microsoft's rule); the script refuses them.

Credentials live in the CLI's own store on the developer's machine, set with
`msstore reconfigure`. Never read, log or commit them.

