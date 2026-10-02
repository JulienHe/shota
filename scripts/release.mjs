/**
 * Builds a signed release and publishes it with the manifest the updater reads.
 *
 *   node scripts/release.mjs            # draft release
 *   node scripts/release.mjs --publish  # and publish it
 *
 * This exists because the manual steps have a silent failure mode. The
 * updater only works if the build was signed, and an unsigned build looks
 * completely normal — same installers, same release page, no warning
 * anywhere. The only symptom is that every installed copy quietly stops
 * finding updates. So the signing key is checked here *before* anything is
 * built, and the run aborts rather than producing artifacts that can't be
 * verified.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const KEY_PATH = process.env.SHOTA_SIGNING_KEY ?? process.env.TAURI_SIGNING_PRIVATE_KEY_PATH;

const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { cwd: ROOT, stdio: "inherit", shell: true, ...opts });

function fail(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

if (!KEY_PATH && !process.env.TAURI_SIGNING_PRIVATE_KEY) {
  fail(
    [
      "No signing key in the environment — refusing to build.",
      "",
      "Without it the installers build fine and the release looks normal, but",
      "no .sig files are produced and every installed copy silently stops",
      "finding updates.",
      "",
      '  SHOTA_SIGNING_KEY="$HOME/.shota-signing/shota.key" npm run release',
    ].join("\n"),
  );
}

if (KEY_PATH && !existsSync(KEY_PATH)) {
  fail(`Signing key not found at ${KEY_PATH}`);
}

// Tauri wants the key *contents* in TAURI_SIGNING_PRIVATE_KEY. It documents
// accepting a path there too, and the key generator advertises a separate
// TAURI_SIGNING_PRIVATE_KEY_PATH, but neither was honoured in practice — the
// build printed "a public key has been found, but no private key", produced
// no .sig, and still exited 0. Reading the file here and passing the contents
// is the form that actually works.
const buildEnv = { ...process.env };
if (KEY_PATH) {
  buildEnv.TAURI_SIGNING_PRIVATE_KEY = readFileSync(KEY_PATH, "utf8").trim();
}
buildEnv.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ??= "";

const version = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version;
const tag = `v${version}`;
const bundle = join(ROOT, "src-tauri", "target", "release", "bundle");
const setup = join(bundle, "nsis", `Shota_${version}_x64-setup.exe`);
const msi = join(bundle, "msi", `Shota_${version}_x64_en-US.msi`);
const sig = `${setup}.sig`;

console.log(`\nBuilding Shota ${version}…\n`);
run("npm", ["run", "tauri", "build"], { env: buildEnv });

// Checked after the build as well as before it, because the build exits 0
// even when signing fails — it prints the reason and carries on bundling.
// The presence of this file is the only trustworthy signal.
if (!existsSync(sig)) {
  fail(`Build finished but ${sig} is missing — the installers are unsigned and updates would not work.`);
}

// The manifest the updater fetches. `signature` is the .sig file's contents,
// not a path: the updater compares it against the public key baked into the
// installed app, which is what stops a tampered installer being accepted.
const manifest = {
  version,
  notes: `See https://github.com/JulienHe/shota/releases/tag/${tag}`,
  pub_date: new Date().toISOString(),
  platforms: {
    "windows-x86_64": {
      signature: readFileSync(sig, "utf8").trim(),
      // Must be the direct asset URL, not the release page.
      url: `https://github.com/JulienHe/shota/releases/download/${tag}/Shota_${version}_x64-setup.exe`,
    },
  },
};

const manifestPath = join(bundle, "latest.json");
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`\nWrote ${manifestPath}`);

const publish = process.argv.includes("--publish");
const notes = join(ROOT, "docs", "release-notes", `${tag}.md`);

const args = [
  "release",
  "create",
  tag,
  "--title",
  `Shota ${tag}`,
  ...(publish ? ["--latest"] : ["--draft"]),
  ...(existsSync(notes) ? ["--notes-file", notes] : ["--generate-notes"]),
  setup,
  msi,
  manifestPath,
];

console.log(`\nCreating ${publish ? "" : "draft "}release ${tag}…\n`);
run("gh", args);

console.log(
  publish
    ? `\nPublished ${tag}.\n`
    : `\nDraft created. Publish with:\n  gh release edit ${tag} --draft=false --latest\n`,
);
