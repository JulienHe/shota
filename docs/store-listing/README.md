# Microsoft Store listings

`listings.json` holds the Store listing for every language the MSIX package declares
(`src-tauri/msix/AppxManifest.xml`): description, short description, what's new, product
features, search terms and screenshot captions. It is the only copy; edit it here, never only
in Partner Center, or the next release overwrites the change.

## Publishing a release to the Store

Shota's Partner Center account is an **individual** developer account, and individual accounts
can't get API access: User management has no "Microsoft Entra applications" tab, so Microsoft's
Store CLI can't authenticate. Releases go through a CSV import instead:

1. `npm run msix` to build the package for the current version.
2. Partner Center: start an update submission and upload `Shota_<version>.0_x64.msix` from
   `src-tauri/target/release/bundle/msix/`.
3. App overview > **Export listing**, which downloads a `.csv`.
4. `npm run store -- --csv "<downloaded file>"`, which writes a `-filled.csv` next to it with
   every language filled in from `listings.json`, after checking each one against Partner
   Center's limits.
5. App overview > **Import listings** > **Import .csv**, pick the filled file, then submit.

The filled file keeps the Field, ID and Type columns exactly as exported (Partner Center
rejects it otherwise), and copies the English column's screenshots and logos to every language
as Partner Center links, so nothing has to be uploaded again.

### If the account ever becomes a company account

`npm run store` can also do the whole release through the CLI (upload, listings, submit), with
`--no-submit`, `--listings-only` and `--dry-run`. It needs `msstore` (`winget install "Microsoft
Store Developer CLI"`) connected once with `msstore reconfigure`, using a Microsoft Entra
application with the Manager role. Untested against the live API until then.

## Fields that are the same in every language

Set once in Partner Center and left alone by the script:

- **Copyright and trademark info:** `© 2026 Julien Henrotte. Licensed under the MIT License.`
- **Additional license terms:** `Shota is open source software licensed under the MIT License. The full licence text is at https://github.com/JulienHe/shota/blob/main/LICENSE`
- **Developed by:** `Shogani.dev`
- **Privacy policy URL:** `https://github.com/JulienHe/shota/blob/main/PRIVACY.md`
- **Website:** `https://github.com/JulienHe/shota` (the link the descriptions themselves can't contain)

## Keeping these honest

The Store build has no updater and makes no network requests of its own, so nothing here
mentions automatic updates. Every feature listed must exist in the Store build as shipped.
`releaseNotes` is "What's new" for the next submission: rewrite it for each release.
