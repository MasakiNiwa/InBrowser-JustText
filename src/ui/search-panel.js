/**
 * 検索・置換パネル。
 *
 * 一致位置はエディタの強調表示に渡す。移動しても textarea には
 * フォーカスを戻さない（Android でソフトキーボードが暴れるため）。
 * 選択範囲も併せて動かすが、どこを置換するかの判断には使わない。
 * フォーカスが検索欄にある間、ブラウザが textarea の選択範囲を
 * 巻き戻すことがあるため、現在位置はこのパネル自身が持つ。
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
import { debounce, formatNumber } from '../util/dom.js';

/** 強調表示に渡す一致件数の上限。 */
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
  let current = -1;
  let truncated = false;
  /**
   * 次に探し始める位置。
   * textarea の選択位置は、フォーカスが検索欄にある間ブラウザ側で
   * 巻き戻されることがあるため、探索の基準はパネル側で持つ。
   */
  let anchor = 0;

  const options = () => ({
    query: query.value,
    useRegex: optRegex.checked,
    caseSensitive: optCase.checked,
    wholeWord: optWord.checked,
  });

  /** 探索の基準位置。編集面を触っている間はそちらのカーソルを優先する。 */
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
        error.textContent = e.message;
        panel.classList.add('has-error');
        return null;
      }
      throw e;
    }
  }

  /** 一致位置を数え直して表示を更新する。 */
  function refresh({ keepCurrent = true } = {}) {
    const re = matcher();
    if (!re) {
      matches = [];
      current = -1;
      truncated = false;
      editor.setHighlights([], -1);
      updateCount();
      return;
    }
    const prevStart = keepCurrent && current >= 0 ? matches[current]?.start : null;
    const result = findAll(editor.getText(), re, MAX_HIGHLIGHTS);
    matches = result.matches;
    truncated = result.truncated;
    current = prevStart == null ? -1 : matches.findIndex((m) => m.start === prevStart);
    editor.setHighlights(matches, current);
    updateCount();
  }

  const refreshSoon = debounce(() => refresh(), 150);

  function updateCount() {
    if (!query.value) {
      count.textContent = '';
      return;
    }
    if (matches.length === 0) {
      count.textContent = '0 件';
      count.classList.add('empty');
      return;
    }
    count.classList.remove('empty');
    const total = truncated ? `${formatNumber(matches.length)}+` : formatNumber(matches.length);
    count.textContent = current >= 0 ? `${current + 1} / ${total}` : `${total} 件`;
  }

  /** 一致位置へ移動する。 */
  function moveTo(index) {
    if (matches.length === 0) return;
    current = (index + matches.length) % matches.length;
    const m = matches[current];
    anchor = m.end;
    editor.setSelection(m.start, m.end);
    editor.setHighlights(matches, current);
    editor.revealOffset(m.start);
    updateCount();
  }

  function next() {
    const re = matcher();
    if (!re) return;
    if (matches.length === 0) refresh({ keepCurrent: false });
    if (matches.length === 0) {
      notify('見つかりませんでした');
      return;
    }
    const from = current >= 0 ? matches[current].end : anchorFrom('end');
    const hit = findNext(editor.getText(), re, from);
    if (!hit) return;
    const index = matches.findIndex((m) => m.start === hit.start);
    if (index >= 0) moveTo(index);
    else {
      // 上限で打ち切られていて一覧に無い場合は位置だけ合わせる
      anchor = hit.end;
      editor.setSelection(hit.start, hit.end);
      editor.revealOffset(hit.start);
    }
  }

  function prev() {
    const re = matcher();
    if (!re) return;
    if (matches.length === 0) refresh({ keepCurrent: false });
    if (matches.length === 0) {
      notify('見つかりませんでした');
      return;
    }
    const from = current >= 0 ? matches[current].start : anchorFrom('start');
    const hit = findPrev(editor.getText(), re, from);
    if (!hit) return;
    const index = matches.findIndex((m) => m.start === hit.start);
    if (index >= 0) moveTo(index);
    else {
      anchor = hit.start;
      editor.setSelection(hit.start, hit.end);
      editor.revealOffset(hit.start);
    }
  }

  /**
   * 現在の一致を置換して次へ進む。
   * どこを置換するかはパネルが持つ current から決める（選択状態には依存しない）。
   */
  function replaceCurrent() {
    const re = matcher();
    if (!re) return;

    // まだどれも選んでいなければ、まず 1 件目へ移動するだけにする
    const target = current >= 0 ? matches[current] : null;
    if (!target) {
      next();
      return;
    }

    const rep = prepareReplacement(replacement.value, optRegex.checked);
    const result = replaceOne(editor.getText(), re, rep, target.start);
    if (!result) {
      next();
      return;
    }

    editor.setText(result.text, {
      selectionStart: result.end,
      selectionEnd: result.end,
      label: '置換',
    });
    anchor = result.end;
    current = -1;
    refresh({ keepCurrent: false });
    next();
  }

  function replaceEvery() {
    const re = matcher();
    if (!re) return;
    const rep = prepareReplacement(replacement.value, optRegex.checked);
    const result = replaceAll(editor.getText(), re, rep);
    if (result.count === 0) {
      notify('置換対象が見つかりませんでした');
      return;
    }
    const caret = Math.min(anchorFrom('start'), result.text.length);
    editor.setText(result.text, {
      selectionStart: caret,
      selectionEnd: caret,
      label: 'すべて置換',
    });
    anchor = caret;
    current = -1;
    refresh({ keepCurrent: false });
    notify(`${formatNumber(result.count)} 件を置換しました`);
  }

  /* ---------- イベント ---------- */

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

  /* ---------- 開閉 ---------- */

  function open({ withSelection = true } = {}) {
    const sel = editor.getSelection();
    anchor = sel.start;
    current = -1;
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
