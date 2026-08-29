/**
 * The row of keys along the bottom of the editor.
 *
 * Soft keyboards have no Tab, and the punctuation that JSON and config files
 * are made of usually sits two layers deep. This row puts both a finger away.
 *
 * Every button hands focus straight back to the textarea — in fact it never
 * takes it, because the pointer press is cancelled before the browser can move
 * focus. Otherwise the keyboard would close on the first tap.
 *
 * It is a real toolbar for keyboard users too: one stop in the tab order, with
 * the arrow keys moving along the row, rather than two dozen stops between the
 * editor and the status bar.
 */

/**
 * What the row holds, in order.
 * `insert` is what gets typed; `label` is what the button shows.
 * Tab has no `insert` of its own: it follows the indent settings instead.
 */
const KEYS = [
  { id: 'tab', label: '⇥', indent: true, labelKey: 'keybar.tab' },
  { id: 'brace-open', insert: '{' },
  { id: 'brace-close', insert: '}' },
  { id: 'bracket-open', insert: '[' },
  { id: 'bracket-close', insert: ']' },
  { id: 'quote', insert: '"' },
  { id: 'colon', insert: ':' },
  { id: 'comma', insert: ',' },
  { id: 'equals', insert: '=' },
  { id: 'paren-open', insert: '(' },
  { id: 'paren-close', insert: ')' },
  { id: 'angle-open', insert: '<' },
  { id: 'angle-close', insert: '>' },
  { id: 'slash', insert: '/' },
  { id: 'backslash', insert: '\\' },
  { id: 'pipe', insert: '|' },
  { id: 'dash', insert: '-' },
  { id: 'underscore', insert: '_' },
  { id: 'hash', insert: '#' },
  { id: 'dollar', insert: '$' },
  { id: 'semicolon', insert: ';' },
  { id: 'apostrophe', insert: "'" },
  { id: 'backtick', insert: '`' },
];

/**
 * @param {object} options
 * @param {HTMLElement} options.container the row itself
 * @param {object} options.editor
 * @param {() => string} options.indentUnit one indent step, per the settings
 * @param {(key:string) => string} options.translate
 */
export function createKeyBar({ container, editor, indentUnit, translate }) {
  const buttons = [];

  for (const key of KEYS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'key';
    button.dataset.key = key.id;
    button.textContent = key.label ?? key.insert;
    if (key.labelKey) button.dataset.labelKey = key.labelKey;
    else button.setAttribute('aria-label', key.insert);

    // Cancelling the press keeps focus — and so the soft keyboard — where it is.
    button.addEventListener('pointerdown', (e) => e.preventDefault());
    button.addEventListener('mousedown', (e) => e.preventDefault());
    button.addEventListener('click', () => {
      editor.insertAtCursor(key.indent ? indentUnit() : key.insert, { label: `keybar:${key.id}` });
    });

    button.tabIndex = buttons.length === 0 ? 0 : -1;
    container.append(button);
    buttons.push(button);
  }

  /** Moves the single tab stop, and the focus, along the row. */
  function focusAt(index) {
    const target = buttons[(index + buttons.length) % buttons.length];
    for (const button of buttons) button.tabIndex = button === target ? 0 : -1;
    target.focus();
  }

  container.addEventListener('keydown', (e) => {
    const index = buttons.indexOf(document.activeElement);
    if (index < 0) return;
    const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (step !== undefined) {
      e.preventDefault();
      focusAt(index + step);
    } else if (e.key === 'Home') {
      e.preventDefault();
      focusAt(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      focusAt(buttons.length - 1);
    }
  });

  /** Re-reads the labels that come from the catalog. */
  function applyLabels() {
    for (const button of buttons) {
      const labelKey = button.dataset.labelKey;
      if (labelKey) button.setAttribute('aria-label', translate(labelKey));
    }
  }

  function setVisible(on) {
    container.hidden = !on;
  }

  applyLabels();
  return { applyLabels, setVisible };
}
