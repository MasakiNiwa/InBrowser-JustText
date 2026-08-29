/**
 * English strings — the reference every other catalog follows.
 * The defaults written into index.html must match these, and every catalog must
 * carry the same keys (both checked by test/i18n.test.js).
 */
export default {
  /* Header */
  'header.file': 'Current file',
  'header.dirty': 'Unsaved changes',
  'header.settings': 'Settings',
  'header.help': 'Help',

  /* Toolbar */
  'toolbar.region': 'Actions',
  'toolbar.open': 'Open',
  'toolbar.save': 'Save',
  'toolbar.undo': 'Undo',
  'toolbar.redo': 'Redo',
  'toolbar.search': 'Find',
  'toolbar.tools': 'Tools',
  'toolbar.copy': 'Copy',
  'toolbar.new': 'New',

  /* Find and replace */
  'search.region': 'Find and replace',
  'search.query': 'Find',
  'search.replacement': 'Replace with',
  'search.prev': 'Find previous',
  'search.next': 'Find next',
  'search.close': 'Close find',
  'search.replace': 'Replace',
  'search.replaceAll': 'All',
  'search.matchCase': 'Aa Case',
  'search.wholeWord': 'Whole word',
  'search.regex': 'Regex',
  'search.count': '{count} found',
  'search.position': '{index} / {total}',
  'search.notFound': 'No matches found',
  'search.noReplaceTarget': 'Nothing to replace',
  'search.replaced': 'Replaced {count} occurrence(s)',
  'search.invalidRegex': 'Invalid regular expression: {detail}',

  /* Editor */
  'editor.label': 'Text editor',
  'editor.placeholder': 'Type here, or load a file with “Open”.',
  'editor.drop': 'Drop a file to open it',

  /* Status bar */
  'status.goToLine': 'Go to line',
  'status.encodingHint': 'Encoding (tap to reopen with another one)',
  'status.newlineHint': 'Line ending used when saving (tap to change)',
  'status.counts': '{lines} lines / {chars} chars',

  /* Files */
  'file.untitled': 'untitled.txt',
  'file.opened': 'Opened {name} ({encoding}, {size})',
  'file.openFailed': 'Could not read the file: {detail}',
  'file.largeConfirm': 'This file is {size}, which may make editing slow. Open it anyway?',
  'file.binaryConfirm': 'This looks like a binary file ({reason}). Opening it as text may corrupt the content. Open it anyway?',
  'file.binaryReasonNul': 'it contains bytes that are not readable as text',
  'file.binaryReasonControl': 'it contains many control characters',
  'file.binaryReasonBroken': 'much of it cannot be decoded with any supported encoding',
  'file.discardOpen': 'You have unsaved changes. Discard them and open another file?',
  'file.discardNew': 'You have unsaved changes. Discard them and start a new file?',
  'file.discardReopen': 'You have unsaved changes. Discard them and reopen the file?',
  'file.noReopen': 'There is no file to reopen',
  'file.reopened': 'Reopened as {encoding}',
  'file.newlineChanged': 'Line ending for saving set to {newline}',

  /* Saving */
  'save.title': 'Save as',
  'save.name': 'File name',
  'save.rename': 'Rename',
  'save.renameHint': 'Add a number to the end',
  'save.encoding': 'Encoding',
  'save.newline': 'Line ending',
  'save.bom': 'Add a BOM',
  'save.cancel': 'Cancel',
  'save.download': 'Download',
  'save.pick': 'Choose location',
  'save.pickHint': 'Pick an existing file to overwrite it',
  'save.overwrite': 'Overwrite',
  'save.overwriteHint': 'Writes directly to {name}',
  'save.noteChars': '{chars} characters',
  'save.noteEncoding': 'Will be written as {encoding}',
  'save.noteOriginal': 'Originally {encoding}',
  'save.done': 'Downloaded {name}',
  'save.savedTo': 'Saved to {name}',
  'save.overwritten': 'Overwrote {name}',
  'save.failed': 'Could not save: {detail}',
  'save.cancelled': 'Saving cancelled',
  'save.overwriteConfirm': 'This replaces the contents of {name}. The original cannot be recovered. Continue?',
  'save.permissionDenied': 'Permission to write the file was not granted',
  'save.lossyNote': 'In the saved file, characters that could not be represented became “?”.',

  /* Characters that cannot be saved */
  'loss.title': 'Some characters cannot be saved',
  'loss.body': '{encoding} cannot represent the following characters.',
  'loss.more': 'and {count} more',
  'loss.explain': 'Saving as-is replaces them with “?”, losing the original characters.',
  'loss.cancel': 'Cancel',
  'loss.replace': 'Save with “?”',
  'loss.utf8': 'Save as UTF-8',

  /* Restoring a draft */
  'draft.title': 'Unsaved work from last time',
  'draft.body': 'Edits to {name} from {time} are still here. Restore them?',
  'draft.restore': 'Restore',
  'draft.discard': 'Discard',
  'draft.restored': 'Restored your unsaved edits',
  'draft.tooLarge': 'This document is too large to keep a draft of. Please save it yourself now and then.',
  'draft.failed': 'The draft could not be written. Please save your work yourself now and then.',

  /* Clipboard */
  'copy.all': 'Copied the whole document ({chars} characters)',
  'copy.selection': 'Copied the selection ({chars} characters)',
  'copy.empty': 'There is nothing to copy',
  'copy.failed': 'Could not copy to the clipboard',

  /* Tools */
  'tools.title': 'Tools',
  'tools.close': 'Close',
  'group.text': 'Text',
  'group.line': 'Lines',
  'group.json': 'JSON',
  'group.file': 'File',
  'group.other': 'Other',

  'cmd.json.format2': 'Format JSON (2 spaces)',
  'cmd.json.format4': 'Format JSON (4 spaces)',
  'cmd.json.formatTab': 'Format JSON (tabs)',
  'cmd.json.minify': 'Minify JSON',
  'cmd.json.minifyHint': 'Remove line breaks and spaces',
  'cmd.json.validate': 'Validate JSON',
  'cmd.json.validateHint': 'Check the syntax without changing anything',
  'cmd.text.trimTrailing': 'Trim trailing whitespace',
  'cmd.text.removeEmptyLines': 'Remove empty lines',
  'cmd.line.sortAsc': 'Sort lines ascending',
  'cmd.line.sortDesc': 'Sort lines descending',
  'cmd.line.unique': 'Remove duplicate lines',
  'cmd.text.tabsToSpaces': 'Tabs → spaces',
  'cmd.text.spacesToTabs': 'Leading spaces → tabs',
  'cmd.text.indent': 'Increase indent',
  'cmd.text.outdent': 'Decrease indent',
  'cmd.app.goto': 'Go to line',
  'cmd.app.reopen': 'Reopen with another encoding',
  'cmd.app.copy': 'Copy everything',

  'json.formatted': 'Formatted the JSON',
  'json.minified': 'Minified the JSON',
  'json.valid': 'This is valid JSON',
  'json.error': 'JSON error: {detail}',
  'json.parseFailed': 'Could not parse as JSON: {detail}',

  /* Settings */
  'settings.title': 'Settings',
  'settings.language': 'Language',
  'settings.theme': 'Theme',
  'settings.themeAuto': 'Match the device',
  'settings.themeLight': 'Light',
  'settings.themeDark': 'Dark',
  'settings.fontSize': 'Text size',
  'settings.smaller': 'Smaller',
  'settings.larger': 'Larger',
  'settings.tabSize': 'Tab width',
  'settings.wrap': 'Wrap long lines',
  'settings.gutter': 'Show line numbers (when wrapping is off)',
  'settings.insertSpaces': 'Insert spaces with the Tab key',
  'settings.autoIndent': 'Keep the indent on a new line',
  'settings.close': 'Close',

  /* Reopen with another encoding */
  'reopen.title': 'Reopen with another encoding',
  'reopen.note': 'Reads the loaded file again using the encoding you choose. Your edits are discarded.',
  'reopen.encoding': 'Encoding',
  'reopen.cancel': 'Cancel',
  'reopen.submit': 'Reopen',

  /* Go to line */
  'goto.title': 'Go to line',
  'goto.line': 'Line number',
  'goto.cancel': 'Cancel',
  'goto.submit': 'Go',

  /* Help */
  'help.title': 'InBrowser JustText',
  'help.lead': 'Edit text in your browser and save it, nothing more. Your files never leave the device.',
  'help.open': 'Loads a text file from your device. The encoding is detected automatically.',
  'help.save': 'Downloads the edited text as a separate file. The original file is left untouched.',
  'help.overwrite': 'Where the browser supports it, you can also choose a location and overwrite an existing file.',
  'help.search': 'Find and replace, with regular expressions, whole-word and case-sensitive matching.',
  'help.tools': 'Format JSON, sort lines, and more.',
  'help.status': 'The encoding and line ending at the bottom of the screen can be changed by tapping them.',
  'help.pwa': 'Add it to your home screen to launch it as an app; it works offline too.',
  'help.share': 'On Android, share a file to this app to open it directly.',
  'help.shortcuts': 'Keyboard: Ctrl+O open / Ctrl+S save / Ctrl+F find / Ctrl+G go to line / Ctrl+Z undo / Ctrl+Shift+Z redo',
  'help.close': 'Close',
  'help.version': 'Version {version}',

  /* Line endings */
  'newline.lf': 'LF (Unix)',
  'newline.crlf': 'CRLF (Windows)',
  'newline.cr': 'CR (classic Mac)',

  /* Shared */
  'common.noChange': 'Nothing changed',
  'common.commandFailed': 'Could not run that: {detail}',
  'common.noscript': 'Please enable JavaScript to use this tool.',

  /* Updates */
  'update.available': 'A new version is available',
  'update.reload': 'Reload',
};
