/**
 * Publishes Shota to the Microsoft Store: the MSIX package and every
 * language's listing, in one go.
 *
 *   npm run store                       upload, update all listings, submit
 *   npm run store -- --no-submit        same, but leave it as a draft to review
 *   npm run store -- --listings-only    update listings only, no new package
 *   npm run store -- --dry-run          check everything locally, send nothing
 *   npm run store -- --dry-run --from submission.json
 *                                       also apply the listings to a saved
 *                                       submission and write the result
 *   npm run store -- --csv export.csv   fill a Partner Center listing export
 *                                       instead, for import by hand
 *
 * The listings come from docs/store-listing/listings.json, one entry per
 * language, so the Store's text lives in the repo next to the app it
 * describes and changes go through review like any other change.
 *
 * The CLI route needs API access, which Partner Center only gives company
 * accounts; Shota's is an individual one. So in practice releases use
 * `--csv`: export the listing from Partner Center, fill it here, import it
 * back. The CLI route (Microsoft's `msstore`, connected once with
 * `msstore reconfigure`) is kept for if that ever changes; its credentials
 * would stay in the CLI's own store, never read here.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(readFileSync(join(ROOT, "src-tauri", "msix", "msix.config.json"), "utf8"));
const PRODUCT_ID = config.storeProductId;
const LISTINGS_PATH = join(ROOT, "docs", "store-listing", "listings.json");

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : args[i + 1];
};

function fail(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}

// ---------------------------------------------------------------- listings --

/** Partner Center's own limits, plus the house rule of no dashes. Checked
 * before anything is sent: the Store reports a bad field only after the
 * upload, one field at a time. */
const LIMITS = { description: 10000, shortDescription: 1000, releaseNotes: 1500, feature: 200, features: 20, keyword: 30, keywords: 7, caption: 200 };

export function validateListings(listings) {
  const problems = [];
  for (const [lang, l] of Object.entries(listings)) {
    const check = (ok, what) => ok || problems.push(`${lang}: ${what}`);
    check(l.description?.length > 0 && l.description.length <= LIMITS.description, "description missing or too long");
    check(!/https?:|www\.|github\.com/i.test(l.description), "description contains a URL (the Store rejects these)");
    check((l.shortDescription ?? "").length <= LIMITS.shortDescription, "short description too long");
    check((l.releaseNotes ?? "").length <= LIMITS.releaseNotes, "what's new too long");
    check(l.features.length <= LIMITS.features, "more than 20 features");
    check(l.features.every((f) => f.length <= LIMITS.feature), "a feature is over 200 characters");
    check(l.keywords.length <= LIMITS.keywords, "more than 7 search terms");
    check(l.keywords.every((k) => k.length <= LIMITS.keyword), "a search term is over 30 characters");
    check(l.screenshotCaptions.every((c) => c.length <= LIMITS.caption), "a caption is over 200 characters");
    const all = [l.description, l.shortDescription, l.releaseNotes, ...l.features, ...l.screenshotCaptions].join("\n");
    check(!/[–—]/.test(all), "contains an en or em dash");
  }
  return problems;
}

/** Case-insensitive property access: the CLI writes the submission in
 * PascalCase, and this must keep whatever casing it was given. */
function keyOf(obj, name) {
  return Object.keys(obj).find((k) => k.toLowerCase() === name.toLowerCase()) ?? name.charAt(0).toUpperCase() + name.slice(1);
}
const get = (obj, name) => obj?.[keyOf(obj, name)];
const set = (obj, name, value) => {
  obj[keyOf(obj, name)] = value;
};

/**
 * Writes the listing text into a submission, in place. Only text: images
 * stay exactly as uploaded (their captions aside), because an image entry
 * refers to a file already stored by Partner Center and rewriting it risks
 * detaching the file. A language with no listing yet starts as a copy of
 * the English one, images included, so it isn't left without a screenshot.
 */
export function applyListings(submission, listings) {
  let all = get(submission, "listings");
  if (!all) {
    all = {};
    set(submission, "listings", all);
  }
  const findLang = (lang) => Object.keys(all).find((k) => k.toLowerCase() === lang.toLowerCase());
  const englishKey = findLang("en-us");

  for (const [lang, l] of Object.entries(listings)) {
    let key = findLang(lang);
    if (!key) {
      if (!englishKey) throw new Error(`No ${lang} listing and no English one to start it from.`);
      key = lang;
      all[key] = structuredClone(all[englishKey]);
    }
    const base = get(all[key], "baseListing");
    if (!base) throw new Error(`The ${lang} listing has no BaseListing.`);
    set(base, "description", l.description);
    set(base, "shortDescription", l.shortDescription);
    set(base, "releaseNotes", l.releaseNotes);
    set(base, "features", l.features);
    set(base, "keywords", l.keywords);

    // Every listing needs at least one screenshot, and Partner Center
    // rejects the submission otherwise; borrow English's if this one has none.
    const isShot = (img) => /screenshot/i.test(get(img, "imageType") ?? "");
    const englishBase = englishKey ? get(all[englishKey], "baseListing") : null;
    if (!(get(base, "images") ?? []).some(isShot) && englishBase && key !== englishKey) {
      const borrowed = (get(englishBase, "images") ?? []).filter(isShot).map((img) => structuredClone(img));
      set(base, "images", [...(get(base, "images") ?? []), ...borrowed]);
    }
    const screenshots = (get(base, "images") ?? []).filter(isShot);
    screenshots.forEach((img, i) => {
      if (l.screenshotCaptions[i] !== undefined) set(img, "description", l.screenshotCaptions[i]);
    });
  }
  return submission;
}

// --------------------------------------------------------------------- CSV --

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

const csvCell = (v) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/**
 * Fills a listing export from Partner Center (App overview > Export
 * listing), for importing by hand when the CLI isn't set up. Field, ID and
 * Type columns are never touched: Partner Center rejects the file if they
 * change. Assets and legal text in the English column are copied to every
 * language, as Partner Center links, so nothing has to be uploaded again.
 */
function fillCsv(path, listings) {
  const raw = readFileSync(path, "utf8").replace(/^﻿/, "");
  const rows = parseCsv(raw);
  const header = rows[0];
  const langs = header.slice(4);
  const col = Object.fromEntries(langs.map((l, i) => [l.toLowerCase(), 4 + i]));
  const byField = Object.fromEntries(rows.slice(1).filter((r) => r[0]).map((r) => [r[0], r]));
  const put = (field, lang, value) => {
    if (byField[field]) byField[field][col[lang]] = value;
  };
  const en = col["en-us"];
  if (en === undefined) fail("The export has no en-us column to copy screenshots and logos from.");

  for (const field of ["DevStudio", "CopyrightTrademarkInformation", "AdditionalLicenseTerms", "StoreLogo720x1080", "StoreLogo1080x1080", "StoreLogo300x300"]
    .concat(Array.from({ length: 30 }, (_, i) => `DesktopScreenshot${i + 1}`))) {
    const value = byField[field]?.[en];
    if (value) for (const lang of Object.keys(col)) put(field, lang, value);
  }
  for (const [lang, l] of Object.entries(listings)) {
    if (col[lang.toLowerCase()] === undefined) continue;
    const L = lang.toLowerCase();
    put("Description", L, l.description);
    put("ShortDescription", L, l.shortDescription);
    put("ReleaseNotes", L, l.releaseNotes);
    for (let i = 0; i < 20; i++) put(`Feature${i + 1}`, L, l.features[i] ?? "");
    for (let i = 0; i < 7; i++) put(`SearchTerm${i + 1}`, L, l.keywords[i] ?? "");
    l.screenshotCaptions.forEach((c, i) => put(`DesktopScreenshotCaption${i + 1}`, L, c));
  }
  const out = path.replace(/\.csv$/i, "") + "-filled.csv";
  // Same encoding as the export: UTF-8 with a BOM, LF line endings.
  writeFileSync(out, "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n", "utf8");
  return out;
}

// ------------------------------------------------------------------ msstore --

function msstore(cliArgs, { capture = false } = {}) {
  const result = spawnSync("msstore", cliArgs, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) fail(`Could not run msstore: ${result.error.message}\nInstall it with: winget install "Microsoft Store Developer CLI"`);
  if (result.status !== 0) fail(`msstore ${cliArgs[0]} ${cliArgs[1] ?? ""} failed (exit ${result.status}).`);
  return result.stdout ?? "";
}

/** The CLI prints progress around the JSON; take the outermost object. */
function extractJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) fail("msstore did not return a submission.");
  return JSON.parse(text.slice(start, end + 1));
}

function cliConfigured() {
  const result = spawnSync("msstore", ["info"], { encoding: "utf8" });
  if (result.error) return { installed: false, configured: false };
  const out = `${result.stdout}${result.stderr}`;
  return { installed: true, configured: result.status === 0 && !/not set/i.test(out) };
}

// --------------------------------------------------------------------- main --

const listings = JSON.parse(readFileSync(LISTINGS_PATH, "utf8"));
const problems = validateListings(listings);
if (problems.length) fail(`Store listings have problems:\n  ${problems.join("\n  ")}`);
console.log(`Listings: ${Object.keys(listings).length} languages, all within Partner Center's limits.`);

const csvPath = option("--csv");
if (csvPath) {
  console.log(`Filled: ${fillCsv(csvPath, listings)}\nImport it in Partner Center: App overview > Import listings > Import .csv.`);
  process.exit(0);
}

const version = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version;
const msix = join(ROOT, "src-tauri", "target", "release", "bundle", "msix", `Shota_${version}.0_x64.msix`);
const listingsOnly = flag("--listings-only");

if (flag("--dry-run")) {
  const from = option("--from");
  if (from) {
    const result = applyListings(JSON.parse(readFileSync(from, "utf8")), listings);
    const out = from.replace(/\.json$/i, "") + "-updated.json";
    writeFileSync(out, JSON.stringify(result, null, 2));
    console.log(`Applied to ${from}: ${out}`);
  }
  if (!listingsOnly) console.log(existsSync(msix) ? `Package: ${msix}` : `Package not built yet: ${msix} (npm run msix)`);
  const cli = cliConfigured();
  console.log(
    !cli.installed
      ? "msstore: not installed"
      : cli.configured
        ? "msstore: connected"
        : "msstore: not connected. Individual Partner Center accounts can't get API access; use --csv instead (see docs/store-listing/README.md)",
  );
  console.log("Dry run: nothing was sent.");
  process.exit(0);
}

if (!PRODUCT_ID) fail("storeProductId is missing from src-tauri/msix/msix.config.json.");
const cli = cliConfigured();
if (!cli.installed) fail('The Store CLI is not installed: winget install "Microsoft Store Developer CLI"');
if (!cli.configured) {
  fail(
    [
      "The Store CLI is not connected to Partner Center. Individual developer accounts can't get API",
      "access, so use the CSV route: export the listing in Partner Center, then",
      '  npm run store -- --csv "<export.csv>"',
      "See docs/store-listing/README.md.",
    ].join("\n"),
  );
}

if (!listingsOnly) {
  if (!existsSync(msix)) fail(`No package for ${version} at ${msix}\nBuild it first: npm run msix`);
  // `publish` replaces any existing draft with a fresh one built from the
  // last published submission, so it has to come before the listing edits,
  // never after: run later, it would throw them away.
  console.log(`\nUploading ${msix}…`);
  msstore(["publish", ROOT, "--inputFile", msix, "--appId", PRODUCT_ID, "--noCommit"]);
}

console.log("\nUpdating listings…");
const submission = extractJson(msstore(["submission", "get", PRODUCT_ID], { capture: true }));
applyListings(submission, listings);
// Passed as a file: fifteen listings are far past Windows' 32k command line.
const file = join(mkdtempSync(join(tmpdir(), "shota-store-")), "submission.json");
writeFileSync(file, JSON.stringify(submission));
msstore(["submission", "updateMetadata", PRODUCT_ID, file]);

if (flag("--no-submit")) {
  console.log("\nLeft as a draft. Review it in Partner Center, then: msstore submission publish " + PRODUCT_ID);
  process.exit(0);
}

console.log("\nSubmitting for certification…");
msstore(["submission", "publish", PRODUCT_ID]);
console.log(`\nSubmitted. Follow it with: msstore submission status ${PRODUCT_ID}`);
