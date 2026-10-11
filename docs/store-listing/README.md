# Microsoft Store listings

One file per language the MSIX package declares (`src-tauri/msix/AppxManifest.xml`).
Partner Center expects a listing for each of them.

| Partner Center language | File |
| --- | --- |
| English | [`en-us.md`](en-us.md) |
| French | [`fr.md`](fr.md) |
| German | [`de.md`](de.md) |
| Spanish | [`es.md`](es.md) |
| Italian | [`it.md`](it.md) |
| Portuguese (Brazil) | [`pt-br.md`](pt-br.md) |
| Dutch | [`nl.md`](nl.md) |
| Polish | [`pl.md`](pl.md) |
| Turkish | [`tr.md`](tr.md) |
| Russian | [`ru.md`](ru.md) |
| Ukrainian | [`uk.md`](uk.md) |
| Japanese | [`ja.md`](ja.md) |
| Korean | [`ko.md`](ko.md) |
| Chinese (Simplified) | [`zh-hans.md`](zh-hans.md) |
| Chinese (Traditional) | [`zh-hant.md`](zh-hant.md) |

## Fields that are the same in every language

- **Copyright and trademark info:** `© 2026 Julien Henrotte. Licensed under the MIT License.`
- **Additional license terms:** `Shota is open source software licensed under the MIT License. The full licence text is at https://github.com/JulienHe/shota/blob/main/LICENSE`
- **Developed by:** `Shogani.dev`
- **Privacy policy URL:** `https://github.com/JulienHe/shota/blob/main/PRIVACY.md`

## Screenshots

`docs/screenshots/store/` holds 1920x1080 shots. The same set can be used for every language.

## Keeping these honest

The Store build has no updater and makes no network requests on its own, so nothing here
mentions automatic updates. Every feature listed must exist in the Store build as shipped.
Update the English file first, then the others, and keep the same structure in each.
