/**
 * キーボード操作。
 *
 * Android のソフトキーボードでは効かないものが多いので、
 * ここでの割り当ては「あると速い」程度の位置づけ。
 * 主要な操作はすべてボタンからも実行できるようにしてある。
 */

export function installKeymap({ editor, actions, settings }) {
  const textarea = editor.el;

  /** 設定に応じたインデント 1 段分の文字列。 */
  const indentUnit = () => (settings.insertSpaces ? ' '.repeat(settings.tabSize) : '\t');

  textarea.addEventListener('keydown', (e) => {
    /* Tab: フォーカス移動ではなくインデント */
    if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      const sel = editor.getSelection();
      const multiline = editor.getText().slice(sel.start, sel.end).includes('\n');
      if (e.shiftKey) {
        actions.outdent();
      } else if (multiline) {
        actions.indent();
      } else {
        editor.insertAtCursor(indentUnit(), { label: 'インデント' });
      }
      return;
    }

    /* Enter: 直前の行のインデントを引き継ぐ */
    if (e.key === 'Enter' && settings.autoIndent && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      const sel = editor.getSelection();
      if (sel.start !== sel.end) return;
      const text = editor.getText();
      const lineStart = text.lastIndexOf('\n', sel.start - 1) + 1;
      const head = text.slice(lineStart, sel.start);
      const indent = (/^[ \t]*/.exec(head) ?? [''])[0];
      if (!indent) return;
      e.preventDefault();
      editor.insertAtCursor(`\n${indent}`, { label: '改行' });
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

  /* 検索欄からでも Esc で閉じ、Ctrl+F / Ctrl+S は拾う */
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
