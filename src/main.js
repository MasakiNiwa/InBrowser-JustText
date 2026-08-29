/**
 * InBrowser JustText — 起動と結線。
 *
 * 役割ごとにモジュールを分けてあり、ここは «部品を組み立てる» だけ。
 * 編集機能を増やすときは src/tools/ にコマンドを足すのが基本。
 */

import { looksBinary } from './core/binary.js';
import { ENCODINGS, decodeText, encodingLabel } from './core/encoding.js';
import { canEncode } from './core/encoder.js';
import { NEWLINES, newlineShort, normalizeToLf } from './core/newline.js';
import { LOCALES, applyTranslations, detectLocale, getLocale, isSupported, setLocale, t } from './i18n/index.js';
import { copyText } from './io/clipboard.js';
import { clearDraft, loadDraft, saveDraft } from './io/draft.js';
import { canPickSaveLocation, pickSaveLocation, writeToHandle } from './io/file-system.js';
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
import { APP_VERSION } from './version.js';
import { $, debounce, formatBytes, formatNumber, rafThrottle } from './util/dom.js';

/* ---------- 状態 ---------- */

const settings = loadSettings();
if (!isSupported(settings.language)) settings.language = detectLocale();

// 起動直後は英語の辞書しか無い。選ばれた言語は boot() で読み込んで切り替える。
let doc = emptyDocument(t('file.untitled'));
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

/* ---------- 表示の反映 ---------- */

function applySettings() {
  document.documentElement.dataset.theme = settings.theme;
  editor.setFontSize(settings.fontSize);
  editor.setWrap(settings.wrap);
  editor.setShowGutter(settings.gutter);
  editor.setTabSize(settings.tabSize);
  saveSettings(settings);
}

/** 言語を切り替えて、画面上の文言をすべて置き換える。 */
async function applyLanguage(code) {
  if (!(await setLocale(code))) return;
  settings.language = code;
  saveSettings(settings);
  applyTranslations();
  buildToolList();
  $('#helpVersion').textContent = t('help.version', { version: APP_VERSION });
  // 名前をまだ付けていない書類は、その言語の既定名に付け替える
  if (doc.untitled) doc = { ...doc, name: t('file.untitled') };
  updateFileInfo();
  updateStatus();
  search.refresh();
}

/* ---------- ステータス表示 ---------- */

const isDirty = () => editor.getText() !== savedText;

function updateFileInfo() {
  $('#fileName').textContent = doc.name;
  $('#dirtyMark').hidden = !isDirty();
  $('#statusEncoding').textContent = encodingLabel(doc.encoding);
  $('#statusNewline').textContent = newlineShort(doc.newline);
}

const updateStatus = rafThrottle(() => {
  const text = editor.getText();
  const { start } = editor.getSelection();
  const index = editor.lineIndex;
  $('#statusPos').textContent = `${index.lineAt(start)} : ${index.columnAt(start)}`;
  $('#statusCount').textContent = t('status.counts', {
    lines: formatNumber(index.lineCount),
    chars: formatNumber(text.length),
  });
  $('#btnUndo').disabled = !editor.canUndo;
  $('#btnRedo').disabled = !editor.canRedo;
  $('#dirtyMark').hidden = !isDirty();
});

editor.on('change', updateStatus);
editor.on('selection', updateStatus);

/* ---------- ダイアログの小道具 ---------- */

/** ダイアログを開き、閉じたときの returnValue を返す。 */
function askDialog(dialog) {
  return new Promise((resolve) => {
    dialog.returnValue = '';
    dialog.addEventListener('close', () => resolve(dialog.returnValue), { once: true });
    dialog.showModal();
  });
}

/* ---------- ドキュメントの読み書き ---------- */

function loadDocument(next, { announce = true } = {}) {
  doc = next;
  editor.load(next.text);
  savedText = next.text;
  updateFileInfo();
  updateStatus();
  if (announce) {
    notify(t('file.opened', {
      name: doc.name,
      encoding: encodingLabel(doc.encoding),
      size: formatBytes(doc.bytes.length),
    }));
  }
}

/** 未保存の変更があれば確認する。 */
function confirmDiscard(messageKey) {
  if (!isDirty()) return true;
  return window.confirm(t(messageKey));
}

async function openFromFile(file, { handle = null } = {}) {
  if (!file) return;
  if (!confirmDiscard('file.discardOpen')) return;
  if (file.size > LARGE_FILE_BYTES) {
    if (!window.confirm(t('file.largeConfirm', { size: formatBytes(file.size) }))) return;
  }

  let next;
  try {
    next = await readFile(file, { fallbackName: t('file.untitled') });
  } catch (e) {
    notify(t('file.openFailed', { detail: e.message }), 'error');
    return;
  }

  // 画像などをテキストとして開くと内容が壊れるので、先に知らせる
  const binary = looksBinary(next.bytes, next.text, next.encoding);
  if (binary.binary) {
    const reason = t(`file.binaryReason${binary.reason[0].toUpperCase()}${binary.reason.slice(1)}`);
    if (!window.confirm(t('file.binaryConfirm', { reason }))) return;
  }

  next.handle = handle;
  loadDocument(next);
}

function newDocument() {
  if (!confirmDiscard('file.discardNew')) return;
  loadDocument(emptyDocument(t('file.untitled')), { announce: false });
  clearDraft();
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
      option.textContent = t(`newline.${n.name}`);
      return option;
    }),
  );
  $('#saveNewline').value = doc.newline;
  $('#saveBom').checked = doc.bom;

  // 上書きできるのは、書き込み先を掴んでいるときだけ
  const overwrite = $('#saveOverwrite');
  overwrite.hidden = !doc.handle;
  if (doc.handle) overwrite.title = t('save.overwriteHint', { name: doc.handle.name });
  $('#savePick').hidden = !canPickSaveLocation();

  updateSaveNote();
  saveDialog.returnValue = '';
  saveDialog.showModal();
}

function updateSaveNote() {
  const encoding = $('#saveEncoding').value;
  const note = [];
  if (encoding !== 'utf-8') note.push(t('save.noteEncoding', { encoding: encodingLabel(encoding) }));
  if (doc.encoding !== encoding && doc.encoding !== 'utf-8') {
    note.push(t('save.noteOriginal', { encoding: encodingLabel(doc.encoding) }));
  }
  note.push(t('save.noteChars', { chars: formatNumber(editor.getText().length) }));
  $('#saveNote').textContent = note.join(' / ');
}

/** 保存できない文字があるとき、どうするかを尋ねる。 */
function askAboutLostCharacters(encoding, unencodable) {
  const chars = [...unencodable.keys()];
  $('#lossBody').textContent = t('loss.body', { encoding: encodingLabel(encoding) });
  const shown = chars.slice(0, 12).join(' ');
  $('#lossChars').textContent = chars.length > 12
    ? `${shown}  （${t('loss.more', { count: chars.length - 12 })}）`
    : shown;
  return askDialog($('#lossDialog'));
}

/**
 * 実際に書き出す。
 * 通知の文言は呼び出し側でまとめるため、ここでは結果だけを返す。
 * @param {'download'|'pick'|'overwrite'} mode
 * @returns {Promise<{ok:boolean, name?:string, handle?:object, message?:string, type?:string}>}
 */
async function writeOut(mode, { name, bytes }) {
  if (mode === 'download') {
    downloadBytes(bytes, name, guessMimeType(name));
    return { ok: true, name, message: t('save.done', { name }) };
  }

  if (mode === 'pick') {
    const handle = await pickSaveLocation({ suggestedName: name, mime: guessMimeType(name) });
    if (!handle) return { ok: false, message: t('save.cancelled') };
    if (!(await writeToHandle(handle, bytes))) {
      return { ok: false, message: t('save.permissionDenied'), type: 'error' };
    }
    return { ok: true, name: handle.name, handle, message: t('save.savedTo', { name: handle.name }) };
  }

  // 上書きは元に戻せないので、必ず確認してから書き込む
  const target = doc.handle;
  if (!target) return { ok: false };
  if (!window.confirm(t('save.overwriteConfirm', { name: target.name }))) {
    return { ok: false, message: t('save.cancelled') };
  }
  if (!(await writeToHandle(target, bytes))) {
    return { ok: false, message: t('save.permissionDenied'), type: 'error' };
  }
  return { ok: true, name: target.name, handle: target, message: t('save.overwritten', { name: target.name }) };
}

/** 保存の一連の流れ。文字が失われる場合は書き出す前に止める。 */
async function performSave(mode) {
  const requestedName = $('#saveName').value.trim();
  const newline = $('#saveNewline').value;
  const bom = $('#saveBom').checked;
  const text = editor.getText();
  let encoding = $('#saveEncoding').value;
  let name = mode === 'overwrite' ? doc.handle.name : requestedName || t('file.untitled');

  let result;
  try {
    result = buildFileBytes(text, { encoding, bom, newline });
  } catch (e) {
    notify(t('save.failed', { detail: e.message }), 'error');
    return false;
  }

  if (result.unencodable.size > 0) {
    const choice = await askAboutLostCharacters(encoding, result.unencodable);
    if (choice !== 'replace' && choice !== 'utf8') {
      notify(t('save.cancelled'));
      return false;
    }
    if (choice === 'utf8') {
      encoding = 'utf-8';
      result = buildFileBytes(text, { encoding, bom, newline });
    }
  }

  let outcome;
  try {
    outcome = await writeOut(mode, { name, bytes: result.bytes });
  } catch (e) {
    notify(t('save.failed', { detail: e.message }), 'error');
    return false;
  }
  if (!outcome.ok) {
    if (outcome.message) notify(outcome.message, outcome.type);
    return false;
  }

  // 書き出したバイト列を読み直したものを「いま保存されている内容」とする。
  //   - 開き直しはこのバイト列を使うので、保存後の内容と食い違わない
  //   - ? に置き換えて保存した場合は編集中の内容と一致しないため、
  //     未保存マークが残り、ファイルと手元が違うことが画面から分かる
  const written = normalizeToLf(decodeText(result.bytes, encoding));
  savedText = written;
  doc = {
    ...doc,
    bytes: result.bytes,
    name: outcome.name ?? name,
    handle: outcome.handle ?? doc.handle,
    encoding,
    newline,
    bom,
    untitled: false,
  };
  updateFileInfo();
  updateStatus();

  const lossy = written !== text;
  notify(lossy ? `${outcome.message} ${t('save.lossyNote')}` : outcome.message);
  return true;
}

/* ---------- クリップボード ---------- */

async function copyToClipboard() {
  const sel = editor.getSelection();
  const whole = editor.getText();
  const selected = sel.end > sel.start;
  const text = selected ? whole.slice(sel.start, sel.end) : whole;
  if (!text) {
    notify(t('copy.empty'));
    return;
  }
  const ok = await copyText(text);
  if (!ok) {
    notify(t('copy.failed'), 'error');
    return;
  }
  notify(t(selected ? 'copy.selection' : 'copy.all', { chars: formatNumber(text.length) }));
}

/* ---------- 下書きの自動保存 ---------- */

/** 入力が落ち着いてから控えを取るまでの待ち時間。 */
const DRAFT_DELAY_MS = 1500;

/**
 * 控えに元のバイト列まで残す上限。
 * これを超えるファイルでは本文だけを残す（復元後は文字コードの指定し直しができない）。
 * 書き込みが重くなるのを避けるための割り切り。
 */
const DRAFT_BYTES_LIMIT = 2 * 1024 * 1024;

function currentDraft() {
  return {
    name: doc.name,
    text: editor.getText(),
    savedText,
    encoding: doc.encoding,
    newline: doc.newline,
    bom: doc.bom,
    bytes: doc.bytes.length <= DRAFT_BYTES_LIMIT ? doc.bytes : null,
    untitled: doc.untitled,
  };
}

/**
 * 未保存の変更があるあいだだけ控えを残す。
 * 保存が済んだら消すので、次の起動で古い内容を勧めてしまうことはない。
 */
const storeDraft = debounce(() => {
  if (isDirty()) saveDraft(currentDraft());
  else clearDraft();
}, DRAFT_DELAY_MS);

editor.on('change', storeDraft);

// アプリを切り替えたり閉じたりする直前は、待たずに書き出す
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') storeDraft.flush();
});
window.addEventListener('pagehide', () => storeDraft.flush());

/** 日時を表示用に整える。 */
function formatTime(at) {
  if (!at) return '';
  try {
    return new Intl.DateTimeFormat(getLocale(), { dateStyle: 'short', timeStyle: 'short' }).format(new Date(at));
  } catch {
    return new Date(at).toLocaleString();
  }
}

/**
 * 前回の編集内容が残っていれば、復元するか尋ねる。
 * @returns {Promise<boolean>} 復元したか
 */
async function offerDraftRestore() {
  const draft = await loadDraft();
  if (!draft?.text) return false;

  $('#draftBody').textContent = t('draft.body', { name: draft.name, time: formatTime(draft.at) });
  const choice = await askDialog($('#draftDialog'));
  if (choice !== 'restore') {
    await clearDraft();
    return false;
  }

  doc = {
    name: draft.name || t('file.untitled'),
    bytes: draft.bytes ?? new Uint8Array(0),
    encoding: draft.encoding ?? 'utf-8',
    bom: draft.bom ?? false,
    newline: draft.newline ?? 'lf',
    detectionReason: 'draft',
    text: draft.text,
    handle: null, // 書き込み先は持ち越せないので、上書きは選び直しになる
    untitled: draft.untitled ?? false,
  };
  editor.load(draft.text);
  savedText = draft.savedText ?? draft.text;
  updateFileInfo();
  updateStatus();
  notify(t('draft.restored'));
  return true;
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
    if (!changed) notify(t('common.noChange'));
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

/** 登録簿に載らない、アプリ側の操作。 */
const APP_COMMANDS = [
  { id: 'app.goto', label: 'cmd.app.goto', run: () => openGotoDialog() },
  { id: 'app.reopen', label: 'cmd.app.reopen', run: () => openReopenDialog() },
  { id: 'app.copy', label: 'cmd.app.copy', run: () => copyToClipboard() },
];

function toolButton(cmd) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'tool-item';
  button.dataset.id = cmd.id;
  const label = document.createElement('span');
  label.className = 'tool-label';
  label.textContent = t(cmd.label);
  button.append(label);
  if (cmd.hint) {
    const hint = document.createElement('span');
    hint.className = 'tool-hint';
    hint.textContent = t(cmd.hint);
    button.append(hint);
  }
  return button;
}

function buildToolList() {
  const list = $('#toolList');
  list.replaceChildren();
  const groups = [...listByGroup(), { id: 'other', label: 'group.other', commands: APP_COMMANDS }];
  for (const group of groups) {
    const heading = document.createElement('h3');
    heading.className = 'tool-group';
    heading.textContent = t(group.label);
    list.append(heading);
    for (const cmd of group.commands) list.append(toolButton(cmd));
  }
}

$('#toolList').addEventListener('click', async (e) => {
  const button = e.target.closest('.tool-item');
  if (!button) return;
  const id = button.dataset.id;
  toolsDialog.close();
  try {
    const appCommand = APP_COMMANDS.find((c) => c.id === id);
    if (appCommand) await appCommand.run();
    else await runCommand(id, context);
  } catch (err) {
    notify(t('common.commandFailed', { detail: err.message }), 'error');
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
    notify(t('file.noReopen'));
    return;
  }
  fillEncodingSelect($('#reopenEncoding'), { onlyEncodable: false });
  $('#reopenEncoding').value = doc.encoding;
  $('#reopenDialog').showModal();
}

/* ---------- 設定画面 ---------- */

function openSettingsDialog() {
  $('#setLanguage').replaceChildren(
    ...LOCALES.map((locale) => {
      const option = document.createElement('option');
      option.value = locale.code;
      option.textContent = locale.label;
      return option;
    }),
  );
  $('#setLanguage').value = getLocale();
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
$('#btnCopy').addEventListener('click', copyToClipboard);
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
  notify(t('file.newlineChanged', { newline: t(`newline.${doc.newline}`) }));
});

/* 保存ダイアログ: 押したボタンの value が保存方法になる */
$('#saveCancel').addEventListener('click', () => saveDialog.close());
$('#saveEncoding').addEventListener('change', updateSaveNote);
$('#saveRename').addEventListener('click', () => {
  $('#saveName').value = suggestCopyName($('#saveName').value.trim() || t('file.untitled'));
});
saveDialog.addEventListener('close', async () => {
  const mode = saveDialog.returnValue;
  if (mode !== 'download' && mode !== 'pick' && mode !== 'overwrite') return;
  await performSave(mode);
});

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
  if (!confirmDiscard('file.discardReopen')) return;
  const next = buildDocument(doc.bytes, doc.name, encoding);
  next.handle = doc.handle;
  loadDocument(next, { announce: false });
  notify(t('file.reopened', { encoding: encodingLabel(encoding) }));
});

/* 設定の変更を即時反映 */
$('#setLanguage').addEventListener('change', (e) => {
  applyLanguage(e.target.value);
});
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
  // 選ばれた言語の辞書を読み込む。読み込めなければ英語のまま動かす。
  await setLocale(settings.language);
  applyTranslations();
  applySettings();
  buildToolList();
  loadDocument(emptyDocument(t('file.untitled')), { announce: false });
  editor.refresh();

  $('#helpVersion').textContent = t('help.version', { version: APP_VERSION });

  // Android の共有メニューから渡されたファイル
  let openedFromShare = false;
  if (hasSharePayload()) {
    clearShareFlag();
    const shared = await takeSharedFile();
    if (shared) {
      loadDocument(buildDocument(shared.bytes, shared.name ?? t('file.untitled')));
      openedFromShare = true;
    }
  }

  // 共有で開いた場合を除き、前回の編集内容が残っていれば尋ねる
  if (!openedFromShare) await offerDraftRestore();

  // PWA として「このアプリで開く」を選んだとき
  if ('launchQueue' in window && typeof LaunchParams !== 'undefined' && 'files' in LaunchParams.prototype) {
    window.launchQueue.setConsumer(async (params) => {
      const handle = params.files?.[0];
      if (!handle) return;
      await openFromFile(await handle.getFile(), { handle });
    });
  }

  registerServiceWorker();
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (!location.protocol.startsWith('http')) return;
  const url = new URL('sw.js', document.baseURI);
  const scope = new URL('./', document.baseURI);
  navigator.serviceWorker
    .register(url, { scope })
    .then((registration) => {
      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          // すでに動いている版がある状態で新しい版が入ったときだけ知らせる
          if (installing.state !== 'installed' || !navigator.serviceWorker.controller) return;
          notify(t('update.available'), 'info', {
            label: t('update.reload'),
            onClick: () => location.reload(),
          });
        });
      });
    })
    .catch(() => {
      /* オフライン対応が使えないだけなので無視する */
    });
}

boot();
