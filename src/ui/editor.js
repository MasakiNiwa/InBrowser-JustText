/**
 * The editing surface.
 *
 * At heart it is a plain <textarea>, so that Android's IME, selection handles
 * and caret behaviour all keep working — far sturdier than any rich re-creation
 * of them. Search hits are drawn on a "mirror" layer holding the same text at
 * the same metrics, sitting behind the transparent textarea.
 *
 *   .editor-body
 *     ├ #highlightLayer  … draws search hits as <mark> (display only)
 *     ├ #measureLayer    … scratch layer for measuring a position
 *     └ <textarea>       … the real editing surface (transparent background)
 */

import { History } from '../core/history.js';
import { LineIndex, expandToLines } from '../core/position.js';
import { escapeHtml, rafThrottle } from '../util/dom.js';

/** Past this many characters, highlighting is dropped — it costs too much. */
const HIGHLIGHT_LIMIT_CHARS = 2 * 1024 * 1024;
/** How many <mark> elements may be drawn at once. */
const HIGHLIGHT_LIMIT_MARKS = 3000;

export function createEditor({ body, textarea, highlightLayer, measureLayer, gutter, gutterInner }) {
  const history = new History();
  const lineIndex = new LineIndex('');

  let highlights = [];
  let currentHighlight = -1;
  let wrap = true;
  let showGutter = true;
  let composing = false;
  let lineIndexDirty = false;

  const listeners = { change: [], selection: [] };
  const emit = (name, ...args) => listeners[name].forEach((fn) => fn(...args));

  /* ---------- Reading and writing ---------- */

  const getText = () => textarea.value;
  const getSelection = () => ({ start: textarea.selectionStart, end: textarea.selectionEnd });

  function markDirty() {
    lineIndexDirty = true;
  }

  function index() {
    if (lineIndexDirty) {
      lineIndex.build(textarea.value);
      lineIndexDirty = false;
    }
    return lineIndex;
  }

  /**
   * Replaces the whole text, recording one undo step.
   * @param {string} text
   * @param {{selectionStart?:number, selectionEnd?:number, label?:string}} [opts]
   *   `label` only names the coalescing unit for the history; it is never shown.
   */
  function setText(text, { selectionStart, selectionEnd, label = 'edit' } = {}) {
    const prev = getSelection();
    textarea.value = text;
    const start = Math.min(selectionStart ?? prev.start, text.length);
    const end = Math.min(selectionEnd ?? prev.end, text.length);
    textarea.setSelectionRange(start, end);
    markDirty();
    history.breakCoalesce();
    history.record({ text, selectionStart: start, selectionEnd: end }, { key: `cmd:${label}` });
    history.breakCoalesce();
    afterChange();
  }

  /** Replaces a range. The caret lands after the inserted text. */
  function replaceRange(start, end, replacement, { label = 'edit', select = false } = {}) {
    const text = getText();
    const next = text.slice(0, start) + replacement + text.slice(end);
    setText(next, {
      selectionStart: select ? start : start + replacement.length,
      selectionEnd: start + replacement.length,
      label,
    });
  }

  /** Inserts text at the caret (used by Tab and auto-indent). */
  function insertAtCursor(str, { label = 'insert' } = {}) {
    const { start, end } = getSelection();
    replaceRange(start, end, str, { label });
  }

  /**
   * Applies a text transform to the selected lines, or to everything when
   * nothing is selected. The same range stays selected afterwards.
   */
  function applyToSelectedLines(fn, label = 'transform') {
    const text = getText();
    const sel = getSelection();
    const hasSelection = sel.start !== sel.end;
    const range = hasSelection ? expandToLines(text, sel.start, sel.end) : { start: 0, end: text.length };
    const before = text.slice(range.start, range.end);
    const after = fn(before);
    if (after === before) return false;
    const next = text.slice(0, range.start) + after + text.slice(range.end);
    setText(next, {
      selectionStart: hasSelection ? range.start : Math.min(sel.start, next.length),
      selectionEnd: hasSelection ? range.start + after.length : Math.min(sel.end, next.length),
      label,
    });
    return true;
  }

  /**
   * Sets the selection.
   *
   * `reveal` means "take me there", so it moves focus into the editor on
   * purpose: with focus elsewhere, Chrome rolls the textarea selection back to
   * where it was and the caret jumps away. Moving between search hits does not
   * use `reveal`, and so never steals focus from the search box.
   */
  function setSelection(start, end = start, { reveal = false } = {}) {
    const len = getText().length;
    const s = Math.max(0, Math.min(start, len));
    const e = Math.max(0, Math.min(end, len));
    if (reveal) textarea.focus({ preventScroll: true });
    textarea.setSelectionRange(s, e);
    if (reveal) revealOffset(e === s ? s : Math.min(s, e));
    emit('selection');
  }

  /* ---------- Undo history ---------- */

  function applyHistoryState(state) {
    if (!state) return false;
    textarea.value = state.text;
    textarea.setSelectionRange(state.selectionStart, state.selectionEnd);
    markDirty();
    afterChange();
    revealOffset(state.selectionEnd);
    return true;
  }

  const undo = () => applyHistoryState(history.undo());
  const redo = () => applyHistoryState(history.redo());

  /* ---------- Redrawing ---------- */

  function afterChange() {
    renderHighlights();
    renderGutter();
    emit('change');
    emit('selection');
  }

  /** Keeps the mirror layers wrapping at the same width as the textarea. */
  const syncLayerWidth = rafThrottle(() => {
    const width = textarea.clientWidth;
    for (const layer of [highlightLayer, measureLayer]) {
      layer.style.width = `${width}px`;
    }
    renderGutter();
  });

  const syncScroll = rafThrottle(() => {
    const x = textarea.scrollLeft;
    const y = textarea.scrollTop;
    highlightLayer.style.transform = `translate(${-x}px, ${-y}px)`;
    renderGutter();
  });

  /** Draws the search hits on the mirror layer. */
  function renderHighlights() {
    const text = getText();
    const active = highlights.length > 0 && !composing && text.length <= HIGHLIGHT_LIMIT_CHARS;
    highlightLayer.hidden = !active;
    if (!active) {
      highlightLayer.innerHTML = '';
      return;
    }
    const shown = highlights.slice(0, HIGHLIGHT_LIMIT_MARKS);
    const parts = [];
    let last = 0;
    shown.forEach((h, i) => {
      if (h.start < last) return; // ignore overlaps, just in case
      parts.push(escapeHtml(text.slice(last, h.start)));
      const cls = i === currentHighlight ? 'hit current' : 'hit';
      parts.push(`<mark class="${cls}" data-i="${i}">${escapeHtml(text.slice(h.start, h.end)) || '​'}</mark>`);
      last = h.end;
    });
    parts.push(escapeHtml(text.slice(last)));
    // A trailing newline alone gives the last line no height, so add a sentinel.
    highlightLayer.innerHTML = `${parts.join('')}\n`;
    highlightLayer.style.transform = `translate(${-textarea.scrollLeft}px, ${-textarea.scrollTop}px)`;
  }

  /** Sets which ranges are highlighted. */
  function setHighlights(ranges, current = -1) {
    highlights = ranges ?? [];
    currentHighlight = current;
    renderHighlights();
  }

  /** Draws the line numbers. Hidden while wrapping, where they would drift. */
  function renderGutter() {
    const enabled = showGutter && !wrap;
    gutter.hidden = !enabled;
    if (!enabled) return;

    const lineHeight = parseFloat(getComputedStyle(textarea).lineHeight) || 20;
    const paddingTop = parseFloat(getComputedStyle(textarea).paddingTop) || 0;
    const total = index().lineCount;
    const first = Math.max(0, Math.floor((textarea.scrollTop - paddingTop) / lineHeight));
    const visible = Math.ceil(textarea.clientHeight / lineHeight) + 2;
    const last = Math.min(total, first + visible);

    const numbers = [];
    for (let n = first + 1; n <= last; n++) numbers.push(n);
    gutterInner.textContent = numbers.join('\n');
    gutterInner.style.transform = `translateY(${paddingTop + first * lineHeight - textarea.scrollTop}px)`;
    gutter.style.setProperty('--gutter-digits', String(Math.max(2, String(total).length)));
  }

  /* ---------- Measuring and scrolling ---------- */

  /**
   * Measures where a character offset sits vertically, in layer coordinates.
   * Uses the current <mark> when the offset is already highlighted, and the
   * scratch measuring layer otherwise.
   */
  function measureTop(offset) {
    const mark = highlightLayer.hidden ? null : highlightLayer.querySelector('mark.current');
    if (mark && highlights[currentHighlight]?.start === offset) return mark.offsetTop;

    const text = getText();
    measureLayer.hidden = false;
    measureLayer.innerHTML = `${escapeHtml(text.slice(0, Math.max(0, Math.min(offset, text.length))))}<span id="probe"></span>`;
    const probe = measureLayer.querySelector('#probe');
    const top = probe ? probe.offsetTop : 0;
    measureLayer.hidden = true;
    measureLayer.innerHTML = '';
    return top;
  }

  /** Scrolls an offset into view, without taking focus. */
  function revealOffset(offset) {
    const top = measureTop(offset);
    const lineHeight = parseFloat(getComputedStyle(textarea).lineHeight) || 20;
    const viewTop = textarea.scrollTop;
    const viewBottom = viewTop + textarea.clientHeight;
    if (top < viewTop + lineHeight || top + lineHeight > viewBottom - lineHeight) {
      textarea.scrollTop = Math.max(0, top - textarea.clientHeight / 3);
    }
    syncScroll();
  }

  /** Jumps to a line number. */
  function goToLine(line) {
    const offset = index().offsetAt(line, 1);
    setSelection(offset, offset, { reveal: true });
  }

  /* ---------- Input handling ---------- */

  textarea.addEventListener('input', (e) => {
    markDirty();
    // Runs of the same kind of input collapse into one undo step; a newline breaks the run.
    const key = e.inputType && !String(e.data ?? '').includes('\n') ? e.inputType : null;
    history.record(
      { text: textarea.value, selectionStart: textarea.selectionStart, selectionEnd: textarea.selectionEnd },
      { key: composing ? 'composition' : key },
    );
    afterChange();
  });

  textarea.addEventListener('compositionstart', () => {
    composing = true;
    renderHighlights(); // hits drift while composing, so clear them for now
  });
  textarea.addEventListener('compositionend', () => {
    composing = false;
    history.breakCoalesce();
    markDirty();
    afterChange();
  });

  textarea.addEventListener('scroll', syncScroll, { passive: true });
  textarea.addEventListener('click', () => emit('selection'));
  textarea.addEventListener('keyup', () => emit('selection'));
  document.addEventListener('selectionchange', () => {
    if (document.activeElement === textarea) emit('selection');
  });

  if ('ResizeObserver' in window) {
    new ResizeObserver(syncLayerWidth).observe(textarea);
  } else {
    window.addEventListener('resize', syncLayerWidth);
  }

  /* ---------- Appearance ---------- */

  function setWrap(on) {
    wrap = on;
    body.classList.toggle('nowrap', !on);
    textarea.setAttribute('wrap', on ? 'soft' : 'off');
    syncLayerWidth();
    renderGutter();
  }

  function setShowGutter(on) {
    showGutter = on;
    renderGutter();
  }

  function setFontSize(px) {
    body.style.setProperty('--editor-font-size', `${px}px`);
    body.style.setProperty('--editor-line-height', `${Math.round(px * 1.6)}px`);
    syncLayerWidth();
    renderGutter();
  }

  function setTabSize(n) {
    body.style.setProperty('--editor-tab-size', String(n));
  }

  /** Loads new content, discarding the undo history. */
  function load(text) {
    textarea.value = text;
    textarea.setSelectionRange(0, 0);
    textarea.scrollTop = 0;
    markDirty();
    history.reset({ text, selectionStart: 0, selectionEnd: 0 });
    setHighlights([], -1);
    afterChange();
  }

  return {
    el: textarea,
    on: (name, fn) => listeners[name].push(fn),
    /** Whether the textarea has focus — i.e. whether its selection can be trusted. */
    get hasFocus() {
      return document.activeElement === textarea;
    },
    load,
    getText,
    setText,
    getSelection,
    setSelection,
    replaceRange,
    insertAtCursor,
    applyToSelectedLines,
    setHighlights,
    revealOffset,
    goToLine,
    undo,
    redo,
    focus: () => textarea.focus(),
    get canUndo() {
      return history.canUndo;
    },
    get canRedo() {
      return history.canRedo;
    },
    get lineIndex() {
      return index();
    },
    setWrap,
    setShowGutter,
    setFontSize,
    setTabSize,
    refresh: () => {
      syncLayerWidth();
      afterChange();
    },
  };
}
