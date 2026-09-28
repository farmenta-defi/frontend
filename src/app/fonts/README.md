# Fonts

The three typefaces of the app, kept in the repo and loaded with `next/font/local`
(`src/app/layout.tsx`). A build fetches nothing from Google.

| File | Typeface | Weights used | Bytes | SHA-256 |
|---|---|---|---|---|
| `plus-jakarta-sans-latin.woff2` | Plus Jakarta Sans | 500 to 700 | 27,272 | `cd8db90cd950e26bc8761f65d323588bd5cd112d326d6d322bc7c8ea86771215` |
| `inter-latin.woff2` | Inter | 400 to 600 | 48,432 | `c940764593d0fe5d596be327ca7558855e018039fb78509aa21921fd3644c3e4` |
| `jetbrains-mono-latin.woff2` | JetBrains Mono | 400 to 500 | 31,340 | `2c32b9b3ee358c119e210f6f5195f9bd34894d78a785ff2e95d60e718e400af4` |

## Where they come from

Google Fonts, the `latin` subset, downloaded on 28 Sep 2026. They are the files
`next/font/google` fetched for this app until then, byte for byte.

Each is a variable font with a weight axis, so one file serves every weight in its range.

## What the subset leaves out

`latin` covers the app's own text. A character outside it is drawn in the system's font. That
is what happened before too, for the two such characters the app uses, the arrow `→` and `≤`:
no subset Google serves for these typefaces holds them.

Before, the build also took the `latin-ext`, Cyrillic, Greek and Vietnamese subsets, and a
page fetched one when a character called for it. The app's text calls for none. If it comes
to show text in those scripts, the subset's file is added here.

## Licence

All three are under the SIL Open Font License 1.1, which allows bundling them with software.
The licence of each is next to it: `OFL-PlusJakartaSans.txt`, `OFL-Inter.txt`,
`OFL-JetBrainsMono.txt`.

## Replacing a file

Put the new file here under the same name, update the row above, and compare the pages before
and after. The names of the CSS variables (`--font-jakarta`, `--font-inter`,
`--font-jetbrains`) are what `globals.css` reads; they do not change with the file.
