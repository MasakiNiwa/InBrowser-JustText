/**
 * Keyboard shortcuts.
 *
 * Most of these do nothing on an Android soft keyboard, so they are a
 * convenience for hardware keyboards rather than the way in. Every important
 * action can also be reached from a button.
 */

export function installKeymap({ editor, actions, settings }) {
  const textarea = editor.el;

  /** One indent step, spaces or a tab depending on the settings. */
  const indentUnit = () => (settings.insertSpaces ? ' '.repeat(settings.tabSize) : '\t');

  textarea.addEventListener('keydown', (e) => {
    /* Tab indents instead of moving focus. */
    if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      const sel = editor.getSelection();
      const multiline = editor.getText().slice(sel.start, sel.end).includes('\n');
      if (e.shiftKey) {
        actions.outdent();
      } else if (multiline) {
        actions.indent();
      } else {
        editor.insertAtCursor(indentUnit(), { label: 'indent' });
      }
      return;
    }

    /* Enter carries the previous line's indent over. */
    if (e.key === 'Enter' && settings.autoIndent && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      const sel = editor.getSelection();
      if (sel.start !== sel.end) return;
      const text = editor.getText();
      const lineStart = text.lastIndexOf('\n', sel.start - 1) + 1;
      const head = text.slice(lineStart, sel.start);
      const indent = (/^[ \t]*/.exec(head) ?? [''])[0];
      if (!indent) return;
      e.preventDefault();
      editor.insertAtCursor(`\n${indent}`, { label: 'newline' });
      return;
    }

    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;

    switch (e.key.toLowerCase()) {
      case 'z':
        e.preventDefault();
        if (e.shiftKey) editor.redo();
        else editor.undo();
        actions.afterHistory();
        break;
      case 'y':
        e.preventDefault();
        editor.redo();
        actions.afterHistory();
        break;
      case 'f':
        e.preventDefault();
        actions.openSearch();
        break;
      case 's':
        e.preventDefault();
        actions.openSave();
        break;
      case 'o':
        e.preventDefault();
        actions.openFile();
        break;
      case 'g':
        e.preventDefault();
        actions.goToLine();
        break;
      default:
        break;
    }
  });

  /* Esc closes from anywhere, and Ctrl+F / Ctrl+S still work outside the editor. */
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      actions.onEscape();
      return;
    }
    const mod = e.ctrlKey || e.metaKey;
    if (!mod || e.target === textarea) return;
    const key = e.key.toLowerCase();
    if (key === 'f') {
      e.preventDefault();
      actions.openSearch();
    } else if (key === 's') {
      e.preventDefault();
      actions.openSave();
    }
  });
}
