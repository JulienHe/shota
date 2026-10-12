# Microsoft Store listings

`listings.json` holds the Store listing for every language the MSIX package declares
(`src-tauri/msix/AppxManifest.xml`): description, short description, what's new, product
features, search terms and screenshot captions. It is the only copy; edit it here, never only
in Partner Center, or the next release overwrites the change.

## Publishing

```
npm run msix                        # build the Store package for the current version
npm run store                       # upload it, update all listings, submit for certification
npm run store -- --no-submit        # same, but leave a draft to review in Partner Center
npm run store -- --listings-only    # text changes only, no new package
npm run store -- --dry-run          # validate and check setup; sends nothing
```

`npm run store` checks every listing against Partner Center's limits before sending anything,
and refuses URLs in descriptions, which the Store rejects.

### One-time setup

1. Partner Center > Account settings > User management > Microsoft Entra applications: add an
   application with the **Manager** role and create a key.
2. Note the Tenant ID, Client ID, key and Seller ID (Account settings > Legal info > Developer).
3. Run `msstore reconfigure` and enter them. The CLI keeps them on this machine; nothing in
   this repo reads or stores them.

The CLI is Microsoft's: `winget install "Microsoft Store Developer CLI"` (needs the .NET 9
Desktop Runtime).

### Without the CLI

`npm run store -- --csv <export.csv>` fills a listing export from Partner Center (App overview >
Export listing) with every language, ready for App overview > Import listings > Import .csv.

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
