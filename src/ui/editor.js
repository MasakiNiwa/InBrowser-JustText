/**
 * 編集面のコントローラ。
 *
 * 本体は素の <textarea>。Android の IME・選択ハンドル・カーソル操作を
 * そのまま使えるのが理由で、リッチな独自実装よりも壊れにくい。
 * 検索の強調表示は、同じ字送りで文字を重ねた「鏡」レイヤーで行う。
 *
 *   .editor-body
 *     ├ #highlightLayer  … 検索一致を <mark> で描く（表示のみ）
 *     ├ #measureLayer    … 任意位置の座標を測る作業用
 *     └ <textarea>       … 実際の編集面（背景は透明、文字だけ見える）
 */

import { History } from '../core/history.js';
import { LineIndex, expandToLines } from '../core/position.js';
import { escapeHtml, rafThrottle } from '../util/dom.js';

/** これを超える文字数のときは強調表示を諦める（描画コストのため）。 */
const HIGHLIGHT_LIMIT_CHARS = 2 * 1024 * 1024;
/** 同時に描く <mark> の上限。 */
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

  /* ---------- 基本の読み書き ---------- */

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
   * 内容を差し替える。履歴に 1 手として積む。
   * @param {string} text
   * @param {{selectionStart?:number, selectionEnd?:number, label?:string}} [opts]
   *   label は履歴をまとめる単位を分けるための名前で、画面には出ない。
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

  /** 範囲を置き換える。カーソルは置換後の末尾へ。 */
  function replaceRange(start, end, replacement, { label = 'edit', select = false } = {}) {
    const text = getText();
    const next = text.slice(0, start) + replacement + text.slice(end);
    setText(next, {
      selectionStart: select ? start : start + replacement.length,
      selectionEnd: start + replacement.length,
      label,
    });
  }

  /** カーソル位置に文字を挿入する（Tab や自動インデント用）。 */
  function insertAtCursor(str, { label = 'insert' } = {}) {
    const { start, end } = getSelection();
    replaceRange(start, end, str, { label });
  }

  /**
   * 選択中の行（無選択なら全文）にテキスト変換を適用する。
   * 変換後も同じ範囲を選択したままにする。
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
   * 選択範囲を設定する。
   *
   * reveal=true は「そこへ連れて行く」意図なので編集面にフォーカスを移す。
   * フォーカスが他所にあるまま選択だけ変えると、Chrome が直前の選択を
   * 復元してしまい位置が戻ってしまうため、ここは意図的にフォーカスを取る。
   * 検索パネルからの移動は reveal を使わず、フォーカスを奪わない。
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

  /* ---------- 履歴 ---------- */

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

  /* ---------- 表示の更新 ---------- */

  function afterChange() {
    renderHighlights();
    renderGutter();
    emit('change');
    emit('selection');
  }

  /** textarea と鏡レイヤーの折り返し幅を揃える。 */
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

  /** 検索一致を鏡レイヤーに描く。 */
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
      if (h.start < last) return; // 念のため重なりを無視
      parts.push(escapeHtml(text.slice(last, h.start)));
      const cls = i === currentHighlight ? 'hit current' : 'hit';
      parts.push(`<mark class="${cls}" data-i="${i}">${escapeHtml(text.slice(h.start, h.end)) || '​'}</mark>`);
      last = h.end;
    });
    parts.push(escapeHtml(text.slice(last)));
    // 末尾の改行だけだと最終行の高さが出ないので番兵を足す
    highlightLayer.innerHTML = `${parts.join('')}\n`;
    highlightLayer.style.transform = `translate(${-textarea.scrollLeft}px, ${-textarea.scrollTop}px)`;
  }

  /** 検索一致の位置を設定する。 */
  function setHighlights(ranges, current = -1) {
    highlights = ranges ?? [];
    currentHighlight = current;
    renderHighlights();
  }

  /** 行番号の描画。折り返し中は行と表示行がずれるため出さない。 */
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

  /* ---------- 位置の測定とスクロール ---------- */

  /**
   * 文字オフセットの画面上の縦位置（レイヤー内座標）を測る。
   * 強調表示済みならその <mark> を、そうでなければ測定用レイヤーを使う。
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

  /** 指定オフセットが見えるようにスクロールする（フォーカスは奪わない）。 */
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

  /** 行番号を指定して移動する。 */
  function goToLine(line) {
    const offset = index().offsetAt(line, 1);
    setSelection(offset, offset, { reveal: true });
  }

  /* ---------- 入力の取り回し ---------- */

  textarea.addEventListener('input', (e) => {
    markDirty();
    // 連続した同種の入力は 1 手にまとめる。改行では区切る。
    const key = e.inputType && !String(e.data ?? '').includes('\n') ? e.inputType : null;
    history.record(
      { text: textarea.value, selectionStart: textarea.selectionStart, selectionEnd: textarea.selectionEnd },
      { key: composing ? 'composition' : key },
    );
    afterChange();
  });

  textarea.addEventListener('compositionstart', () => {
    composing = true;
    renderHighlights(); // 変換中はずれるので一旦消す
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

  /* ---------- 見た目の設定 ---------- */

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

  /** 新しい内容を読み込む（履歴は破棄する）。 */
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
    /** 編集面自身にフォーカスがあるか（選択位置を信用してよいかの判断に使う）。 */
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
