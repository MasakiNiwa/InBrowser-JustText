# Changelog

Dates are release dates. The layout follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
A Japanese version of this file is kept at [CHANGELOG.ja.md](CHANGELOG.ja.md).

## [0.3.0]

### Changed

- English is now the repository's language. The README, the changelog, every code comment and
  every test name are written in English; Japanese is kept alongside as a second language for
  the documentation, in [README.ja.md](README.ja.md) and [CHANGELOG.ja.md](CHANGELOG.ja.md)
- Portuguese is listed simply as **Português**, with no country beside it. The catalog moved
  from `pt-br.js` to `pt.js`, and every region of Portuguese reads the same one
- Sorting lines now follows the interface language rather than always collating as Japanese
- The browser run drives the app in English, with Japanese checked as the second language

### Fixed

- A draft was not offered back when the document had been emptied. Deleting everything is an
  edit like any other, and now comes back as the empty document it was
- Loading a document programmatically — restoring a draft, reopening under another encoding —
  could schedule the draft for deletion moments later, losing work that had not been saved
- The draft is now brought in line the instant a save succeeds, so a crash straight afterwards
  can no longer bring back the state from before it
- Replace did nothing for a match past the 3,000-highlight cap: the panel now keeps the current
  match itself rather than an index into the highlighted ones

## [0.2.0]

### Added

- 15 interface languages (English, French, German, Italian, Spanish, Portuguese, Japanese,
  Simplified Chinese, Traditional Chinese, Korean, Hindi, Indonesian, Vietnamese, Thai and
  Arabic). The device language decides which one opens, and it can be changed at any time in
  settings. In Arabic the interface mirrors right to left
- Edits are kept on the device as they are made, and offered back on the next launch (IndexedDB)
- "Choose location" and "Overwrite", where the browser supports them
- A button that copies the whole document, or the selection, to the clipboard
- A notice when a new version has been installed, with a reload to hand
- The version is shown in the help dialog

### Changed

- A character the chosen encoding cannot hold now stops the save before anything is written,
  offering "save as UTF-8", "save with ? instead" or "cancel"
- The file picker no longer filters by extension, so `.properties` and extensionless files can
  be opened; files that look binary are flagged as they are read instead
- The encoding and line-ending readouts carry a border and a ▾, so it is clear they can be pressed
- The settings icon is now a gear
- Inputs are at least 16px, so iOS no longer zooms in when one is tapped
- Keyboard users can see which control has focus

### Fixed

- The state after a save now matches the file: reopening reads the bytes that were written, and
  a save that replaced characters with `?` keeps the unsaved mark on, showing that the file and
  the screen differ
- A failed write is abandoned rather than committed, leaving the original file as it was
- "Next" carries on past the 3,000-match highlight cap

## [0.1.0]

### Added

- First release: open a text file, edit it, and save it as a separate download
- Find and replace, with case-sensitive, whole-word and regular-expression matching
- Encoding detection (UTF-8 / Shift_JIS / EUC-JP / ISO-2022-JP / UTF-16 / Windows-1252), and a
  choice of encoding, line ending and BOM when saving
- Undo and redo, line numbers, go to line, word wrap
- Tools: format, minify and validate JSON, sort lines, and more
- A PWA that works offline and opens files from Android's share menu
