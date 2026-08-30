# Changelog

Dates are release dates. The layout follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
A Japanese version of this file is kept at [CHANGELOG.ja.md](CHANGELOG.ja.md).

## [0.4.1]

### Fixed

- A draft left by 0.3 was invisible to 0.4. Those were all stored under one key
  and carried no key of their own, and the new listing skipped them — so anybody
  updating with unsaved work could not get it back, though it was still there.
  The key is now read from the store rather than from the record
- The JSON commands could quietly change what a file said. Reformatting goes
  through the browser's parser, which rounds a number too large for it to hold
  and keeps only the last of a repeated key. They now stop instead, name what is
  in the way and put the caret on it; **Validate** reports the same, so it can be
  found before it matters
- Sorting keys dropped `__proto__`. It is an ordinary key in JSON, but assigning
  it to a plain object sets the prototype instead of a property, and it vanished
  from the output
- A draft another open tab was still writing to was offered as though it had been
  left behind. Discarding it took away that tab's only backup until its next
  keystroke. Open tabs now say which drafts are theirs, and those are left out
- Restoring a draft deleted the original without checking that the copy had
  landed. If only the copy failed, both were lost. The original now stays put
  unless the copy is safely stored
- The restore dialog left the session without a key — and so without any autosave
  — if it was closed by anything other than its own buttons

### Changed

- Leftover drafts are shown in one list, with the file name, when each was last
  touched and a glimpse of what is in it. Restore one, drop one, drop them all,
  or leave them for later, rather than being asked about one per launch

## [0.4.0]

### Added

- A row of keys above the status bar for Tab and the punctuation that soft
  keyboards bury — `{}`, `[]`, quotes, colons and the rest. It never takes
  focus, so the keyboard stays open while you use it, and Tab follows the indent
  settings. It can be turned off in settings
- Whole-line editing: duplicate, delete, move up and move down
- **Sort JSON keys**, which formats with every key in order so that two config
  files can be compared line for line
- **Insert a tab** in the tools menu, for when the key row is hidden
- The status bar shows how much is selected while there is a selection
- A link to the source on GitHub, from the help screen

### Changed

- The dot beside the file name now says whether unsaved work is actually being
  kept on the device, and turns orange when it is not — because the document is
  too large, or storage is unavailable
- Drafts are kept per editing session rather than under one shared key. Two tabs,
  or a file arriving from the share menu, each keep a copy of their own; leftover
  copies are offered one per launch, and any never claimed are dropped after
  30 days
- What the autosave keeps, and where it stops, is written down in the help screen
  and the README

### Fixed

- A file opened from the share menu could take the earlier draft with it. Editing
  it wrote over that draft, and saving it deleted it — in both cases losing work
  that had never been offered back. Every session now writes under a key of its
  own, so it can only ever clear what it wrote itself
- Saving now waits for the draft to be brought in line before it reports success,
  closing the gap where a crash in that moment could resurrect the state from
  before the save

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
