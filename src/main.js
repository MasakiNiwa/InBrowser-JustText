/**
 * InBrowser JustText — 起動と結線。
 *
 * 役割ごとにモジュールを分けてあり、ここは «部品を組み立てる» だけ。
 * 編集機能を増やすときは src/tools/ にコマンドを足すのが基本。
 */

import { ENCODINGS, encodingLabel } from './core/encoding.js';
import { canEncode } from './core/encoder.js';
import { NEWLINES, newlineLabel } from './core/newline.js';
import { buildDocument, readFile, emptyDocument, LARGE_FILE_BYTES } from './io/open.js';
import { buildFileBytes, downloadBytes, guessMimeType, suggestCopyName } from './io/save.js';
import { hasSharePayload, clearShareFlag, takeSharedFile } from './io/share-target.js';
import { listByGroup, runCommand } from './tools/registry.js';
import './tools/json-tools.js';
import './tools/text-tools.js';
import { createEditor } from './ui/editor.js';
import { createSearchPanel } from './ui/search-panel.js';
import { createToast } from './ui/toast.js';
import { installKeymap } from './ui/keymap.js';
import { loadSettings, saveSettings } from './ui/settings.js';
import { $, formatBytes, formatNumber, rafThrottle } from './util/dom.js';

/* ---------- 状態 ---------- */

const settings = loadSettings();
let doc = emptyDocument();
let savedText = '';

const notify = createToast($('#toastArea'));

const editor = createEditor({
  body: $('#editorBody'),
  textarea: $('#input'),
  highlightLayer: $('#highlightLayer'),
  measureLayer: $('#measureLayer'),
  gutter: $('#gutter'),
  gutterInner: $('#gutterInner'),
});

const search = createSearchPanel({
  elements: {
    panel: $('#searchPanel'),
    query: $('#searchQuery'),
    replacement: $('#searchReplace'),
    btnPrev: $('#btnFindPrev'),
    btnNext: $('#btnFindNext'),
    btnReplace: $('#btnReplace'),
    btnReplaceAll: $('#btnReplaceAll'),
    btnClose: $('#btnSearchClose'),
    count: $('#searchCount'),
    error: $('#searchError'),
    optCase: $('#optCase'),
    optWord: $('#optWord'),
    optRegex: $('#optRegex'),
  },
  editor,
  notify,
});

/* ---------- 設定の反映 ---------- */

function applySettings() {
  document.documentElement.dataset.theme = settings.theme;
  editor.setFontSize(settings.fontSize);
  editor.setWrap(settings.wrap);
  editor.setShowGutter(settings.gutter);
  editor.setTabSize(settings.tabSize);
  saveSettings(settings);
}

/* ---------- ステータス表示 ---------- */

const isDirty = () => editor.getText() !== savedText;

function updateFileInfo() {
  $('#fileName').textContent = doc.name;
  $('#dirtyMark').hidden = !isDirty();
  $('#statusEncoding').textContent = encodingLabel(doc.encoding);
  $('#statusNewline').textContent = newlineLabel(doc.newline).split(' ')[0];
}

const updateStatus = rafThrottle(() => {
  const text = editor.getText();
  const { start } = editor.getSelection();
  const index = editor.lineIndex;
  $('#statusPos').textContent = `${index.lineAt(start)} : ${index.columnAt(start)}`;
  $('#statusCount').textContent = `${formatNumber(index.lineCount)} 行 / ${formatNumber(text.length)} 文字`;
  $('#btnUndo').disabled = !editor.canUndo;
  $('#btnRedo').disabled = !editor.canRedo;
  $('#dirtyMark').hidden = !isDirty();
});

editor.on('change', updateStatus);
editor.on('selection', updateStatus);

/* ---------- ドキュメントの読み書き ---------- */

function loadDocument(next, { announce = true } = {}) {
  doc = next;
  editor.load(next.text);
  savedText = next.text;
  updateFileInfo();
  updateStatus();
  if (announce) {
    const size = doc.bytes.length ? `・${formatBytes(doc.bytes.length)}` : '';
    notify(`${doc.name} を開きました（${encodingLabel(doc.encoding)}${size}）`);
  }
}

/** 未保存の変更があれば確認する。 */
function confirmDiscard(message) {
  if (!isDirty()) return true;
  return window.confirm(message);
}

async function openFromFile(file) {
  if (!file) return;
  if (!confirmDiscard('未保存の変更があります。破棄して開きますか？')) return;
  if (file.size > LARGE_FILE_BYTES) {
    const ok = window.confirm(
      `${formatBytes(file.size)} と大きなファイルです。動作が重くなることがあります。開きますか？`,
    );
    if (!ok) return;
  }
  try {
    loadDocument(await readFile(file));
  } catch (e) {
    notify(`読み込みに失敗しました: ${e.message}`, 'error');
  }
}

function newDocument() {
  if (!confirmDiscard('未保存の変更があります。破棄して新規作成しますか？')) return;
  loadDocument(emptyDocument(), { announce: false });
  editor.focus();
}

/* ---------- 保存 ---------- */

const saveDialog = $('#saveDialog');

function fillEncodingSelect(select, { onlyEncodable }) {
  select.replaceChildren();
  for (const enc of ENCODINGS) {
    if (onlyEncodable && !canEncode(enc.name)) continue;
    const option = document.createElement('option');
    option.value = enc.name;
    option.textContent = enc.label;
    select.append(option);
  }
}

function openSaveDialog() {
  $('#saveName').value = doc.name;
  fillEncodingSelect($('#saveEncoding'), { onlyEncodable: true });
  $('#saveEncoding').value = canEncode(doc.encoding) ? doc.encoding : 'utf-8';
  $('#saveNewline').replaceChildren(
    ...NEWLINES.map((n) => {
      const option = document.createElement('option');
      option.value = n.name;
      option.textContent = n.label;
      return option;
    }),
  );
  $('#saveNewline').value = doc.newline;
  $('#saveBom').checked = doc.bom;
  updateSaveNote();
  saveDialog.showModal();
}

function updateSaveNote() {
  const encoding = $('#saveEncoding').value;
  const note = [];
  if (encoding !== 'utf-8') note.push(`${encodingLabel(encoding)} で書き出します`);
  if (doc.encoding !== encoding && doc.encoding !== 'utf-8') {
    note.push(`元は ${encodingLabel(doc.encoding)} でした`);
  }
  note.push(`${formatNumber(editor.getText().length)} 文字`);
  $('#saveNote').textContent = note.join(' / ');
}

function performSave() {
  const name = $('#saveName').value.trim() || '無題.txt';
  const encoding = $('#saveEncoding').value;
  const newline = $('#saveNewline').value;
  const bom = $('#saveBom').checked;
  const text = editor.getText();

  let result;
  try {
    result = buildFileBytes(text, { encoding, bom, newline });
  } catch (e) {
    notify(`保存できませんでした: ${e.message}`, 'error');
    return;
  }

  downloadBytes(result.bytes, name, guessMimeType(name));

  savedText = text;
  doc = { ...doc, name, encoding, newline, bom };
  updateFileInfo();

  if (result.unencodable.size > 0) {
    const chars = [...result.unencodable.keys()].slice(0, 8).join(' ');
    notify(`${encodingLabel(encoding)} で表せない文字を ? に置き換えました: ${chars}`, 'error');
  } else {
    notify(`${name} をダウンロードしました`);
  }
}

/* ---------- コマンドから使う文脈 ---------- */

const context = {
  settings,
  indentUnit: () => (settings.insertSpaces ? ' '.repeat(settings.tabSize) : '\t'),
  getText: () => editor.getText(),
  setText: (text, opts) => editor.setText(text, opts),
  getSelection: () => editor.getSelection(),
  setSelection: (start, end, opts) => editor.setSelection(start, end, opts),
  applyToSelectedLines: (fn, label) => {
    const changed = editor.applyToSelectedLines(fn, label);
    if (!changed) notify('変更はありませんでした');
    return changed;
  },
  notify,
  get document() {
    return doc;
  },
  goToLine: (line) => editor.goToLine(line),
};

/* ---------- ツール一覧 ---------- */

const toolsDialog = $('#toolsDialog');

function buildToolList() {
  const list = $('#toolList');
  list.replaceChildren();
  for (const group of listByGroup()) {
    const heading = document.createElement('h3');
    heading.className = 'tool-group';
    heading.textContent = group.label;
    list.append(heading);
    for (const cmd of group.commands) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'tool-item';
      button.dataset.id = cmd.id;
      button.innerHTML = `<span class="tool-label"></span>${cmd.hint ? '<span class="tool-hint"></span>' : ''}`;
      button.querySelector('.tool-label').textContent = cmd.label;
      if (cmd.hint) button.querySelector('.tool-hint').textContent = cmd.hint;
      list.append(button);
    }
  }
  // 登録簿に載らない、アプリ側の操作
  const heading = document.createElement('h3');
  heading.className = 'tool-group';
  heading.textContent = 'その他';
  list.append(heading);
  for (const [id, label] of [
    ['app.goto', '行へ移動'],
    ['app.reopen', '文字コードを指定して開き直す'],
  ]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tool-item';
    button.dataset.id = id;
    button.innerHTML = '<span class="tool-label"></span>';
    button.querySelector('.tool-label').textContent = label;
    list.append(button);
  }
}

$('#toolList').addEventListener('click', async (e) => {
  const button = e.target.closest('.tool-item');
  if (!button) return;
  const id = button.dataset.id;
  toolsDialog.close();
  try {
    if (id === 'app.goto') openGotoDialog();
    else if (id === 'app.reopen') openReopenDialog();
    else await runCommand(id, context);
  } catch (err) {
    notify(`実行できませんでした: ${err.message}`, 'error');
  }
});

/* ---------- 行へ移動 / 開き直し ---------- */

function openGotoDialog() {
  const input = $('#gotoLine');
  input.max = String(editor.lineIndex.lineCount);
  input.value = String(editor.lineIndex.lineAt(editor.getSelection().start));
  $('#gotoDialog').showModal();
  input.select();
}

function openReopenDialog() {
  if (doc.bytes.length === 0) {
    notify('開き直せるファイルがありません');
    return;
  }
  fillEncodingSelect($('#reopenEncoding'), { onlyEncodable: false });
  $('#reopenEncoding').value = doc.encoding;
  $('#reopenDialog').showModal();
}

/* ---------- 設定画面 ---------- */

function openSettingsDialog() {
  $('#setTheme').value = settings.theme;
  $('#fontValue').value = String(settings.fontSize);
  $('#setTabSize').value = String(settings.tabSize);
  $('#setWrap').checked = settings.wrap;
  $('#setGutter').checked = settings.gutter;
  $('#setInsertSpaces').checked = settings.insertSpaces;
  $('#setAutoIndent').checked = settings.autoIndent;
  $('#settingsDialog').showModal();
}

/* ---------- 操作の割り当て ---------- */

const actions = {
  openFile: () => $('#filePicker').click(),
  openSave: () => openSaveDialog(),
  openSearch: () => search.open(),
  goToLine: () => openGotoDialog(),
  indent: () => runCommand('text.indent', context),
  outdent: () => runCommand('text.outdent', context),
  afterHistory: () => updateStatus(),
  onEscape: () => {
    if (search.isOpen) search.close();
  },
};

installKeymap({ editor, actions, settings });

$('#btnOpen').addEventListener('click', actions.openFile);
$('#btnSave').addEventListener('click', actions.openSave);
$('#btnNew').addEventListener('click', newDocument);
$('#btnSearch').addEventListener('click', () => search.toggle());
$('#btnTools').addEventListener('click', () => toolsDialog.showModal());
$('#btnSettings').addEventListener('click', openSettingsDialog);
$('#btnHelp').addEventListener('click', () => $('#helpDialog').showModal());
$('#btnUndo').addEventListener('click', () => {
  editor.undo();
  updateStatus();
});
$('#btnRedo').addEventListener('click', () => {
  editor.redo();
  updateStatus();
});

$('#filePicker').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  e.target.value = ''; // 同じファイルを連続で選べるように
  await openFromFile(file);
});

$('#statusPos').addEventListener('click', openGotoDialog);
$('#statusEncoding').addEventListener('click', openReopenDialog);
$('#statusNewline').addEventListener('click', () => {
  const order = NEWLINES.map((n) => n.name);
  doc = { ...doc, newline: order[(order.indexOf(doc.newline) + 1) % order.length] };
  updateFileInfo();
  notify(`保存時の改行コードを ${newlineLabel(doc.newline)} にしました`);
});

/* 保存ダイアログ */
$('#saveCancel').addEventListener('click', () => saveDialog.close());
$('#saveEncoding').addEventListener('change', updateSaveNote);
$('#saveRename').addEventListener('click', () => {
  $('#saveName').value = suggestCopyName($('#saveName').value.trim() || '無題.txt');
});
$('#saveForm').addEventListener('submit', () => performSave());

/* ツール / 設定 / その他ダイアログ */
$('#toolsClose').addEventListener('click', () => toolsDialog.close());
$('#settingsClose').addEventListener('click', () => $('#settingsDialog').close());
$('#helpClose').addEventListener('click', () => $('#helpDialog').close());
$('#gotoCancel').addEventListener('click', () => $('#gotoDialog').close());
$('#reopenCancel').addEventListener('click', () => $('#reopenDialog').close());

$('#gotoForm').addEventListener('submit', () => {
  const line = Number($('#gotoLine').value);
  if (Number.isFinite(line) && line >= 1) editor.goToLine(line);
});

$('#reopenForm').addEventListener('submit', () => {
  const encoding = $('#reopenEncoding').value;
  if (!confirmDiscard('未保存の変更があります。破棄して開き直しますか？')) return;
  loadDocument(buildDocument(doc.bytes, doc.name, encoding), { announce: false });
  notify(`${encodingLabel(encoding)} として読み直しました`);
});

/* 設定の変更を即時反映 */
$('#setTheme').addEventListener('change', (e) => {
  settings.theme = e.target.value;
  applySettings();
});
$('#setTabSize').addEventListener('change', (e) => {
  settings.tabSize = Number(e.target.value);
  applySettings();
});
for (const [id, key] of [
  ['#setWrap', 'wrap'],
  ['#setGutter', 'gutter'],
  ['#setInsertSpaces', 'insertSpaces'],
  ['#setAutoIndent', 'autoIndent'],
]) {
  $(id).addEventListener('change', (e) => {
    settings[key] = e.target.checked;
    applySettings();
  });
}
for (const [id, delta] of [['#fontSmaller', -1], ['#fontLarger', 1]]) {
  $(id).addEventListener('click', () => {
    settings.fontSize = Math.max(10, Math.min(28, settings.fontSize + delta));
    $('#fontValue').value = String(settings.fontSize);
    applySettings();
  });
}

/* ---------- ドラッグ＆ドロップ ---------- */

const dropOverlay = $('#dropOverlay');
let dragDepth = 0;

window.addEventListener('dragenter', (e) => {
  if (!e.dataTransfer || ![...e.dataTransfer.types].includes('Files')) return;
  dragDepth++;
  dropOverlay.hidden = false;
});
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) dropOverlay.hidden = true;
});
window.addEventListener('drop', async (e) => {
  e.preventDefault();
  dragDepth = 0;
  dropOverlay.hidden = true;
  await openFromFile(e.dataTransfer?.files?.[0]);
});

/* ---------- 離脱時の確認 ---------- */

window.addEventListener('beforeunload', (e) => {
  if (!isDirty()) return;
  e.preventDefault();
  e.returnValue = '';
});

/* ---------- 起動処理 ---------- */

async function boot() {
  applySettings();
  buildToolList();
  loadDocument(emptyDocument(), { announce: false });
  editor.refresh();

  // Android の共有メニューから渡されたファイル
  if (hasSharePayload()) {
    clearShareFlag();
    const shared = await takeSharedFile();
    if (shared) loadDocument(buildDocument(shared.bytes, shared.name));
    else notify('共有されたファイルを取得できませんでした', 'error');
  }

  // PWA として「このアプリで開く」を選んだとき
  if ('launchQueue' in window && typeof LaunchParams !== 'undefined' && 'files' in LaunchParams.prototype) {
    window.launchQueue.setConsumer(async (params) => {
      const handle = params.files?.[0];
      if (!handle) return;
      await openFromFile(await handle.getFile());
    });
  }

  registerServiceWorker();
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (!location.protocol.startsWith('http')) return;
  const url = new URL('sw.js', document.baseURI);
  const scope = new URL('./', document.baseURI);
  navigator.serviceWorker.register(url, { scope }).catch(() => {
    /* オフライン対応が使えないだけなので無視する */
  });
}

boot();
