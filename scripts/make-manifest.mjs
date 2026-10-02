/**
 * Writes `latest.json`, the manifest the updater fetches to decide whether a
 * newer version exists.
 *
 * Split out of release.mjs so the local release path and the CI workflow
 * produce a byte-identical manifest rather than two implementations that
 * drift. A wrong manifest fails in the worst way available: the app is
 * running, the release is published, and the only symptom is that nobody
 * ever gets offered the update.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = process.env.GITHUB_REPOSITORY ?? "JulienHe/shota";

export function makeManifest({ version, sigPath, outPath }) {
  if (!existsSync(sigPath)) {
    throw new Error(
      `${sigPath} is missing — the installer is unsigned, so every installed copy would silently stop finding updates.`,
    );
  }

  const tag = `v${version}`;
  const manifest = {
    version,
    notes: `See https://github.com/${REPO}/releases/tag/${tag}`,
    pub_date: new Date().toISOString(),
    platforms: {
      "windows-x86_64": {
        // The .sig file's contents, not a path. The updater checks this
        // against the public key compiled into the installed app, which is
        // what stops a tampered installer being accepted.
        signature: readFileSync(sigPath, "utf8").trim(),
        // Must be the direct asset download, not the release page — the
        // updater fetches this URL expecting installer bytes.
        url: `https://github.com/${REPO}/releases/download/${tag}/Shota_${version}_x64-setup.exe`,
      },
    },
  };

  writeFileSync(outPath, JSON.stringify(manifest, null, 2));
  return outPath;
}

// Also runnable directly, which is how the CI workflow uses it.
if (process.argv[1] && process.argv[1].endsWith("make-manifest.mjs")) {
  const version = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version;
  const bundle = join(ROOT, "src-tauri", "target", "release", "bundle");
  const out = makeManifest({
    version,
    sigPath: join(bundle, "nsis", `Shota_${version}_x64-setup.exe.sig`),
    outPath: join(bundle, "latest.json"),
  });
  console.log(`wrote ${out}`);
}
