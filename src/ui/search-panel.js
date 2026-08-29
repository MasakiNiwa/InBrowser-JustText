/**
 * The find-and-replace panel.
 *
 * Matches are handed to the editor for highlighting. Moving between them never
 * pulls focus back into the textarea, because that makes the Android soft
 * keyboard jump around. The selection follows along, but it is not what decides
 * where a replacement goes: while focus sits in the search box, the browser can
 * roll the textarea selection back, so the panel keeps the current match itself.
 */

import {
  createMatcher,
  findAll,
  findNext,
  findPrev,
  prepareReplacement,
  replaceAll,
  replaceOne,
  SearchError,
} from '../core/search.js';
import { t } from '../i18n/index.js';
import { debounce, formatNumber } from '../util/dom.js';

/** How many matches are handed to the highlight layer at once. */
const MAX_HIGHLIGHTS = 3000;

export function createSearchPanel({ elements, editor, notify }) {
  const {
    panel,
    query,
    replacement,
    btnPrev,
    btnNext,
    btnReplace,
    btnReplaceAll,
    btnClose,
    count,
    error,
    optCase,
    optWord,
    optRegex,
  } = elements;

  let matches = [];
  /** Index into `matches`, or -1 when the current match is past the cap. */
  let currentIndex = -1;
  /**
   * The match that is selected right now.
   * Kept separately from the index so that replacing still works past
   * MAX_HIGHLIGHTS, where the match is not in `matches` at all.
   */
  let currentMatch = null;
  let truncated = false;
  /**
   * Where the next search starts from.
   * While focus is in the search box the browser can roll the textarea
   * selection back, so the panel keeps its own anchor.
   */
  let anchor = 0;

  const options = () => ({
    query: query.value,
    useRegex: optRegex.checked,
    caseSensitive: optCase.checked,
    wholeWord: optWord.checked,
  });

  /** Where to search from. While the editor has focus its caret wins. */
  function anchorFrom(which = 'end') {
    if (editor.hasFocus) {
      const sel = editor.getSelection();
      return which === 'start' ? sel.start : sel.end;
    }
    return anchor;
  }

  function matcher() {
    try {
      error.textContent = '';
      panel.classList.remove('has-error');
      return createMatcher(options());
    } catch (e) {
      if (e instanceof SearchError) {
        error.textContent = t(e.code, { detail: e.detail });
        panel.classList.add('has-error');
        return null;
      }
      throw e;
    }
  }

  /** Recount the matches and refresh what is shown. */
  function refresh({ keepCurrent = true } = {}) {
    const re = matcher();
    if (!re) {
      matches = [];
      currentIndex = -1;
      currentMatch = null;
      truncated = false;
      editor.setHighlights([], -1);
      updateCount();
      return;
    }
    const previous = keepCurrent ? currentMatch : null;
    const result = findAll(editor.getText(), re, MAX_HIGHLIGHTS);
    matches = result.matches;
    truncated = result.truncated;
    currentIndex = previous ? matches.findIndex((m) => m.start === previous.start) : -1;
    currentMatch = currentIndex >= 0 ? matches[currentIndex] : previous;
    editor.setHighlights(matches, currentIndex);
    updateCount();
  }

  const refreshSoon = debounce(() => refresh(), 150);

  function updateCount() {
    if (!query.value) {
      count.textContent = '';
      return;
    }
    if (matches.length === 0) {
      count.textContent = t('search.count', { count: 0 });
      count.classList.add('empty');
      return;
    }
    count.classList.remove('empty');
    const total = truncated ? `${formatNumber(matches.length)}+` : formatNumber(matches.length);
    count.textContent = currentIndex >= 0
      ? t('search.position', { index: currentIndex + 1, total })
      : t('search.count', { count: total });
  }

  /** Move to one of the listed matches. */
  function moveTo(index) {
    if (matches.length === 0) return;
    currentIndex = (index + matches.length) % matches.length;
    currentMatch = matches[currentIndex];
    anchor = currentMatch.end;
    editor.setSelection(currentMatch.start, currentMatch.end);
    editor.setHighlights(matches, currentIndex);
    editor.revealOffset(currentMatch.start);
    updateCount();
  }

  /**
   * Move to a match that is past MAX_HIGHLIGHTS and therefore not listed.
   * The index is dropped, but the match itself is kept so that "replace"
   * still knows what to act on.
   */
  function moveToUnlisted(hit, direction) {
    currentIndex = -1;
    currentMatch = hit;
    anchor = direction === 'start' ? hit.start : hit.end;
    editor.setHighlights(matches, -1);
    editor.setSelection(hit.start, hit.end);
    editor.revealOffset(hit.start);
    updateCount();
  }

  function next() {
    const re = matcher();
    if (!re) return;
    if (matches.length === 0) refresh({ keepCurrent: false });
    if (matches.length === 0) {
      notify(t('search.notFound'));
      return;
    }
    const from = currentMatch ? currentMatch.end : anchorFrom('end');
    const hit = findNext(editor.getText(), re, from);
    if (!hit) return;
    const index = matches.findIndex((m) => m.start === hit.start);
    if (index >= 0) moveTo(index);
    else moveToUnlisted(hit, 'end');
  }

  function prev() {
    const re = matcher();
    if (!re) return;
    if (matches.length === 0) refresh({ keepCurrent: false });
    if (matches.length === 0) {
      notify(t('search.notFound'));
      return;
    }
    const from = currentMatch ? currentMatch.start : anchorFrom('start');
    const hit = findPrev(editor.getText(), re, from);
    if (!hit) return;
    const index = matches.findIndex((m) => m.start === hit.start);
    if (index >= 0) moveTo(index);
    else moveToUnlisted(hit, 'start');
  }

  /**
   * Replace the current match and move on.
   * What gets replaced comes from `currentMatch`, which is kept even for
   * matches past the highlight cap, and never from the textarea selection.
   */
  function replaceCurrent() {
    const re = matcher();
    if (!re) return;

    // Nothing picked yet: just move to the first match.
    if (!currentMatch) {
      next();
      return;
    }

    const rep = prepareReplacement(replacement.value, optRegex.checked);
    const result = replaceOne(editor.getText(), re, rep, currentMatch.start);
    if (!result) {
      next();
      return;
    }

    editor.setText(result.text, {
      selectionStart: result.end,
      selectionEnd: result.end,
      label: 'search.replace',
    });
    anchor = result.end;
    currentIndex = -1;
    currentMatch = null;
    refresh({ keepCurrent: false });
    next();
  }

  function replaceEvery() {
    const re = matcher();
    if (!re) return;
    const rep = prepareReplacement(replacement.value, optRegex.checked);
    const result = replaceAll(editor.getText(), re, rep);
    if (result.count === 0) {
      notify(t('search.noReplaceTarget'));
      return;
    }
    const caret = Math.min(anchorFrom('start'), result.text.length);
    editor.setText(result.text, {
      selectionStart: caret,
      selectionEnd: caret,
      label: 'search.replaceAll',
    });
    anchor = caret;
    currentIndex = -1;
    currentMatch = null;
    refresh({ keepCurrent: false });
    notify(t('search.replaced', { count: formatNumber(result.count) }));
  }

  /* ---------- Events ---------- */

  query.addEventListener('input', () => refresh({ keepCurrent: false }));
  for (const opt of [optCase, optWord, optRegex]) {
    opt.addEventListener('change', () => refresh({ keepCurrent: false }));
  }
  query.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (e.shiftKey) prev();
    else next();
  });
  replacement.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    replaceCurrent();
  });

  btnNext.addEventListener('click', next);
  btnPrev.addEventListener('click', prev);
  btnReplace.addEventListener('click', replaceCurrent);
  btnReplaceAll.addEventListener('click', replaceEvery);
  btnClose.addEventListener('click', () => close());

  editor.on('change', () => {
    if (!panel.hidden && query.value) refreshSoon();
  });

  /* ---------- Opening and closing ---------- */

  function open({ withSelection = true } = {}) {
    const sel = editor.getSelection();
    anchor = sel.start;
    currentIndex = -1;
    currentMatch = null;
    if (withSelection && sel.end > sel.start && sel.end - sel.start < 200) {
      const picked = editor.getText().slice(sel.start, sel.end);
      if (!picked.includes('\n')) query.value = picked;
    }
    panel.hidden = false;
    refresh({ keepCurrent: false });
    query.focus();
    query.select();
  }

  function close() {
    panel.hidden = true;
    editor.setHighlights([], -1);
    editor.focus();
  }

  function toggle() {
    if (panel.hidden) open();
    else close();
  }

  return { open, close, toggle, refresh, next, prev, get isOpen() { return !panel.hidden; } };
}
