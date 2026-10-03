/**
 * Packs the Microsoft Store build as an MSIX.
 *
 *   node scripts/pack-msix.mjs            # build, then pack
 *   node scripts/pack-msix.mjs --no-build # pack what's already there
 *
 * Shota is unusually easy to package: the release output is a single
 * self-contained shota.exe with no DLLs, so the package is that one binary,
 * a handful of icons Tauri already generates, and a manifest.
 *
 * The build is deliberately `--no-default-features`, which compiles out the
 * updater. The Store updates apps itself and its policy requires that; two
 * update mechanisms racing to install over each other is worse than either
 * alone. Packing a default build would produce a package that fails review
 * *and* misbehaves.
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MSIX_DIR = join(ROOT, "src-tauri", "msix");
const STAGE = join(ROOT, "src-tauri", "target", "msix-stage");
const OUT_DIR = join(ROOT, "src-tauri", "target", "release", "bundle", "msix");

const quote = (arg) => (/[\s"]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg);
// The command itself is quoted too, not just the arguments: makeappx lives
// under "C:\Program Files (x86)\...", and with shell: true an unquoted path
// containing spaces is split into a command plus stray arguments.
const run = (cmd, args, opts = {}) =>
  execFileSync(quote(cmd), args.map(quote), { cwd: ROOT, stdio: "inherit", shell: true, ...opts });

function fail(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

/** makeappx ships with the Windows SDK, which installs per-version. */
function findMakeAppx() {
  const roots = [
    "C:/Program Files (x86)/Windows Kits/10/bin",
    "C:/Program Files/Windows Kits/10/bin",
  ];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    // Newest SDK first, so a stale 10.0.17763 doesn't win over a current one.
    const versions = readdirSync(root, { withFileTypes: true })
      .filter((e) => e.isDirectory() && /^10\./.test(e.name))
      .map((e) => e.name)
      .sort()
      .reverse();
    for (const v of versions) {
      const candidate = join(root, v, "x64", "makeappx.exe");
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

const config = JSON.parse(readFileSync(join(MSIX_DIR, "msix.config.json"), "utf8"));
const version = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version;

if (config.identityName.includes("REPLACE") || config.publisher.includes("REPLACE")) {
  console.warn(
    [
      "",
      "WARNING: msix.config.json still has placeholder identity values.",
      "The package will build and can be installed locally for testing, but the",
      "Store will reject it — identity must match the name reserved in Partner",
      "Center (Product > Product identity).",
      "",
    ].join("\n"),
  );
}

const makeappx = findMakeAppx();
if (!makeappx) fail("makeappx.exe not found. Install the Windows SDK (it ships with Visual Studio's 'Desktop development with C++' workload).");

if (!process.argv.includes("--no-build")) {
  console.log("\nBuilding the Store variant (updater compiled out)...\n");
  // Only the executable is needed, so this skips bundling installers.
  // `--no-default-features` is a cargo flag, so it goes after `--`; passing it
  // directly to the Tauri CLI is rejected as an unknown argument.
  run("npx", ["tauri", "build", "--no-bundle", "--", "--no-default-features"]);
}

const exe = join(ROOT, "src-tauri", "target", "release", "shota.exe");
if (!existsSync(exe)) fail(`${exe} is missing — run without --no-build.`);

// Fresh staging directory every time: a leftover file from a previous run
// would be silently included in the package.
rmSync(STAGE, { recursive: true, force: true });
mkdirSync(join(STAGE, "Assets"), { recursive: true });

cpSync(exe, join(STAGE, "shota.exe"));

const icons = join(ROOT, "src-tauri", "icons");
for (const asset of ["StoreLogo.png", "Square150x150Logo.png", "Square44x44Logo.png"]) {
  const from = join(icons, asset);
  if (!existsSync(from)) fail(`Missing icon ${from} — the manifest references it.`);
  cpSync(from, join(STAGE, "Assets", asset));
}

// MSIX versions are always four parts, and the Store requires the revision to
// be 0 — it reserves that field for its own rebuilds.
const manifest = readFileSync(join(MSIX_DIR, "AppxManifest.xml"), "utf8")
  .replace(/{{IDENTITY_NAME}}/g, config.identityName)
  .replace(/{{PUBLISHER}}/g, config.publisher)
  .replace(/{{VERSION}}/g, `${version}.0`)
  .replace(/{{DISPLAY_NAME}}/g, config.displayName)
  .replace(/{{PUBLISHER_DISPLAY_NAME}}/g, config.publisherDisplayName)
  .replace(/{{DESCRIPTION}}/g, config.description);

writeFileSync(join(STAGE, "AppxManifest.xml"), manifest);

mkdirSync(OUT_DIR, { recursive: true });
const out = join(OUT_DIR, `Shota_${version}.0_x64.msix`);
rmSync(out, { force: true });

console.log("\nPacking...\n");
run(makeappx, ["pack", "/d", STAGE, "/p", out, "/o"]);

console.log(
  [
    "",
    `Packed ${out}`,
    "",
    "The package is unsigned, which is correct for Store submission — Microsoft",
    "signs it on their side. To install it locally for testing you need to sign",
    "it with a self-signed certificate whose subject matches Identity/Publisher",
    "and trust that certificate first.",
    "",
  ].join("\n"),
);
