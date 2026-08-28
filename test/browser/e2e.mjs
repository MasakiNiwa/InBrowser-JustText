/**
 * ブラウザでの通し確認。
 *
 *   npm run test:browser
 *
 * Playwright が必要（`npm i -D playwright` と `npx playwright install chromium`）。
 * 単体テスト（npm test）では見られない、次のような部分を確認する。
 *   - 検索ハイライトが本文と 1px もずれずに重なるか
 *   - 行番号が本文の行と揃うか
 *   - 文字コードを保ったまま読み書きできるか（ダウンロードの中身を検証）
 *   - オフライン起動と、Android の「共有」からの受け取り
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, devices } from 'playwright';

import { encodeText } from '../../src/core/encoder.js';

const PORT = 8137;
const BASE = `http://localhost:${PORT}/`;
const WORK = mkdtempSync(join(tmpdir(), 'justtext-e2e-'));

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`);
};

/* ---------- 配信サーバ ---------- */

const server = spawn(process.execPath, [join(import.meta.dirname, '../../scripts/serve.js'), String(PORT)], {
  stdio: 'ignore',
});
const stopServer = () => server.kill();
process.on('exit', stopServer);

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(BASE);
      if (res.ok) return;
    } catch {
      /* まだ起動していない */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('サーバが起動しませんでした');
}
await waitForServer();

/* ---------- 試験用ファイル ---------- */

const sjisPath = join(WORK, 'sample-sjis.json');
writeFileSync(sjisPath, encodeText('{\r\n  "設定": "日本語の設定ファイル",\r\n  "値": 42\r\n}\r\n', 'shift_jis').bytes);

/* ---------- 本体 ---------- */

const browser = await chromium.launch();
const context = await browser.newContext({ ...devices['Pixel 7'], acceptDownloads: true });
const page = await context.newPage();

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.evaluate(() => { window.confirm = () => true; });

check('ページが読み込める', (await page.title()) === 'InBrowser JustText');
check('起動時にエラーが出ない', errors.length === 0, errors.join(' | '));
check('起動時は検索パネルが閉じている', !(await page.locator('#searchPanel').isVisible()));
check('起動時はドロップ表示が出ていない', !(await page.locator('#dropOverlay').isVisible()));

/* ---------- 入力とステータス ---------- */

const sample = ['{', '  "name": "テスト",', '  "items": [1, 2, 3],', '  "note": "foo bar foo"', '}'].join('\n');
await page.fill('#input', sample);
await page.waitForTimeout(150);
check('文字数が表示される', (await page.textContent('#statusCount')).includes(`${sample.length} 文字`));
check('行数が表示される', (await page.textContent('#statusCount')).startsWith('5 行'));
check('未保存マークが出る', await page.locator('#dirtyMark').isVisible());

/* ---------- 検索 ---------- */

await page.click('#btnSearch');
await page.fill('#searchQuery', 'foo');
await page.waitForTimeout(250);
check('一致件数が出る', (await page.textContent('#searchCount')).includes('2'));
check('ハイライトが描画される', (await page.locator('#highlightLayer mark').count()) === 2);

const metrics = await page.evaluate(() => {
  const ta = document.querySelector('#input');
  const layer = document.querySelector('#highlightLayer');
  const a = getComputedStyle(ta);
  const b = getComputedStyle(layer);
  return {
    same: a.font === b.font && a.lineHeight === b.lineHeight && a.padding === b.padding
      && a.whiteSpace === b.whiteSpace && a.tabSize === b.tabSize && a.letterSpacing === b.letterSpacing,
    layerWidth: layer.getBoundingClientRect().width,
    taClientWidth: ta.clientWidth,
  };
});
check('鏡レイヤーの字送りが本文と一致', metrics.same, JSON.stringify(metrics));
check('鏡レイヤーの折り返し幅が一致', Math.abs(metrics.layerWidth - metrics.taClientWidth) < 0.5);

await page.click('#btnFindNext');
await page.waitForTimeout(150);
check('現在位置が強調される', (await page.locator('#highlightLayer mark.current').count()) === 1);
check('カウンタが n/m 表示', (await page.textContent('#searchCount')) === '1 / 2');

/* 一致した文字の上にハイライトが正確に重なっているか */
const overlap = await page.evaluate(() => {
  const ta = document.querySelector('#input');
  const mark = document.querySelector('#highlightLayer mark.current');
  const rect = mark.getBoundingClientRect();
  // 本文側で同じ位置を測るために、同じ内容・同じ字送りの計測要素を使う
  const probe = document.createElement('div');
  const cs = getComputedStyle(ta);
  for (const prop of ['fontFamily', 'fontSize', 'lineHeight', 'letterSpacing', 'padding', 'whiteSpace', 'overflowWrap', 'tabSize']) {
    probe.style[prop] = cs[prop];
  }
  probe.style.position = 'absolute';
  probe.style.visibility = 'hidden';
  probe.style.width = `${ta.clientWidth}px`;
  probe.style.boxSizing = 'border-box';
  const index = ta.value.indexOf('foo');
  probe.innerHTML = `${ta.value.slice(0, index).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}<span id="p">foo</span>`;
  ta.parentElement.append(probe);
  const probeRect = probe.querySelector('#p').getBoundingClientRect();
  const base = probe.getBoundingClientRect();
  probe.remove();
  return {
    dx: Math.abs((rect.left - ta.getBoundingClientRect().left) - (probeRect.left - base.left)),
    dy: Math.abs((rect.top - ta.getBoundingClientRect().top) - (probeRect.top - base.top)),
    width: Math.abs(rect.width - probeRect.width),
  };
});
check('ハイライトが文字と重なる', overlap.dx < 1 && overlap.dy < 1 && overlap.width < 1, JSON.stringify(overlap));

/* 選んだ一致だけを置換できるか */
await page.click('#btnFindNext');
await page.waitForTimeout(150);
check('次へ移動できる', (await page.textContent('#searchCount')) === '2 / 2');
await page.fill('#searchReplace', 'ZZZ');
await page.click('#btnReplace');
await page.waitForTimeout(250);
check('選択中の一致だけが置換される', (await page.inputValue('#input')).includes('"foo bar ZZZ"'));

await page.fill('#searchReplace', 'BAZ');
await page.click('#btnReplaceAll');
await page.waitForTimeout(250);
check('すべて置換できる', (await page.inputValue('#input')).includes('"BAZ bar ZZZ"'));

await page.check('#optRegex');
await page.fill('#searchQuery', '(\\d), (\\d)');
await page.fill('#searchReplace', '$2-$1');
await page.click('#btnReplaceAll');
await page.waitForTimeout(250);
check('正規表現の後方参照が効く', (await page.inputValue('#input')).includes('[2-1, 3]'));

await page.fill('#searchQuery', '[');
await page.waitForTimeout(250);
check('不正な正規表現を知らせる', (await page.textContent('#searchError')).length > 0);
await page.uncheck('#optRegex');
await page.fill('#searchQuery', '');
await page.click('#btnSearchClose');
await page.waitForTimeout(150);
check('検索を閉じるとハイライトも消える', (await page.locator('#highlightLayer mark').count()) === 0);

/* ---------- 元に戻す / やり直す ---------- */

await page.click('#btnUndo');
await page.click('#btnUndo');
await page.click('#btnUndo');
await page.waitForTimeout(200);
check('元に戻せる', (await page.inputValue('#input')).includes('foo bar foo'));
await page.click('#btnRedo');
await page.waitForTimeout(150);
check('やり直せる', (await page.inputValue('#input')).includes('ZZZ'));

/* ---------- キーボード操作 ---------- */

await page.fill('#input', '');
await page.click('#input');
await page.keyboard.type('  インデント');
await page.keyboard.press('Enter');
await page.waitForTimeout(150);
check('改行でインデントを引き継ぐ', (await page.inputValue('#input')) === '  インデント\n  ', JSON.stringify(await page.inputValue('#input')));
await page.keyboard.press('Tab');
await page.waitForTimeout(100);
check('Tab でスペースが入る', (await page.inputValue('#input')).endsWith('    '), JSON.stringify(await page.inputValue('#input')));
await page.keyboard.press('Control+f');
await page.waitForTimeout(200);
check('Ctrl+F で検索が開く', await page.locator('#searchPanel').isVisible());
await page.keyboard.press('Escape');
await page.waitForTimeout(150);
check('Esc で検索が閉じる', !(await page.locator('#searchPanel').isVisible()));

/* ---------- ファイルを開く（Shift_JIS + CRLF） ---------- */

await page.setInputFiles('#filePicker', sjisPath);
await page.waitForTimeout(500);
check('Shift_JIS を判定して開く', (await page.textContent('#statusEncoding')) === 'Shift_JIS');
check('日本語が化けずに読める', (await page.inputValue('#input')).includes('日本語の設定ファイル'));
check('ファイル名が表示される', (await page.textContent('#fileName')) === 'sample-sjis.json');
check('CRLF を検出する', (await page.textContent('#statusNewline')) === 'CRLF');
check('読み込み直後は未保存マークなし', !(await page.locator('#dirtyMark').isVisible()));

/* ---------- ツール ---------- */

await page.click('#btnTools');
await page.click('.tool-item[data-id="json.format2"]');
await page.waitForTimeout(300);
const formatted = await page.inputValue('#input');
check('JSON を整形できる', formatted.startsWith('{\n  "') && JSON.parse(formatted)['設定'] === '日本語の設定ファイル');

await page.click('#btnTools');
await page.click('.tool-item[data-id="json.minify"]');
await page.waitForTimeout(300);
check('JSON を最小化できる', !(await page.inputValue('#input')).includes('\n'));

await page.fill('#input', '{\n  "a": 1,\n  "b" 2\n}');
await page.waitForTimeout(150);
await page.click('#btnTools');
await page.click('.tool-item[data-id="json.validate"]');
await page.waitForTimeout(400);
check('壊れた JSON でカーソルが該当位置へ動く', (await page.evaluate(() => document.querySelector('#input').selectionStart)) === 18);
check('エラーが通知される', (await page.textContent('#toastArea')).includes('JSON'));

await page.fill('#input', 'c\na\nb');
await page.waitForTimeout(100);
await page.click('#btnTools');
await page.click('.tool-item[data-id="line.sortAsc"]');
await page.waitForTimeout(300);
check('行を並べ替えられる', (await page.inputValue('#input')) === 'a\nb\nc');

/* ---------- 保存（ダウンロード） ---------- */

await page.fill('#input', 'テスト保存\nsecond line');
await page.waitForTimeout(150);
await page.click('#btnSave');
await page.waitForTimeout(300);
await page.click('#saveRename');
check('別名ボタンで連番が付く', (await page.inputValue('#saveName')).includes('(1)'));
await page.fill('#saveName', 'output.txt');
await page.selectOption('#saveEncoding', 'shift_jis');
await page.selectOption('#saveNewline', 'crlf');
const [download] = await Promise.all([page.waitForEvent('download'), page.click('#saveConfirm')]);
const savedPath = join(WORK, 'output.txt');
await download.saveAs(savedPath);
check('ダウンロード名が指定どおり', download.suggestedFilename() === 'output.txt');
const savedBytes = readFileSync(savedPath);
check('Shift_JIS・CRLF で保存される', new TextDecoder('shift_jis').decode(savedBytes) === 'テスト保存\r\nsecond line');
await page.waitForTimeout(300);
check('保存後に未保存マークが消える', !(await page.locator('#dirtyMark').isVisible()));

await page.fill('#input', 'ABC漢字');
await page.click('#btnSave');
await page.waitForTimeout(200);
await page.fill('#saveName', 'ascii.txt');
await page.selectOption('#saveEncoding', 'windows-1252');
const [dl2] = await Promise.all([page.waitForEvent('download'), page.click('#saveConfirm')]);
await dl2.saveAs(join(WORK, 'ascii.txt'));
await page.waitForTimeout(300);
check('変換できない文字を警告する', (await page.textContent('#toastArea')).includes('?'));

/* ---------- 行番号 ---------- */

await page.fill('#input', Array.from({ length: 60 }, (_, i) => `line ${i + 1}`).join('\n'));
await page.click('#btnSettings');
await page.waitForTimeout(200);
await page.uncheck('#setWrap');
await page.click('#settingsClose');
await page.waitForTimeout(300);
check('折り返しオフで行番号が出る', await page.locator('#gutter').isVisible());

const deltas = [];
const firstNumbers = [];
for (const scrollTop of [0, 100, 240, 900]) {
  const r = await page.evaluate(async (s) => {
    const ta = document.querySelector('#input');
    ta.scrollTop = s;
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    const g = document.querySelector('#gutterInner');
    const cs = getComputedStyle(ta);
    return {
      scrollTop: ta.scrollTop,
      padTop: parseFloat(cs.paddingTop),
      lineHeight: parseFloat(cs.lineHeight),
      firstNumber: Number(g.textContent.split('\n')[0]),
      gutterTop: g.getBoundingClientRect().top,
      taBoxTop: ta.getBoundingClientRect().top,
    };
  }, scrollTop);
  firstNumbers.push(r.firstNumber);
  deltas.push(Math.abs(r.gutterTop - (r.taBoxTop + r.padTop + (r.firstNumber - 1) * r.lineHeight - r.scrollTop)));
}
check('先頭では 1 行目から表示される', firstNumbers[0] === 1);
check('行番号が本文と正確に揃う', Math.max(...deltas) < 0.5, `最大ずれ ${Math.max(...deltas).toFixed(2)}px`);

await page.click('#statusPos');
await page.waitForTimeout(200);
await page.fill('#gotoLine', '42');
await page.click('#gotoDialog button[type="submit"]');
await page.waitForTimeout(300);
check('行へ移動できる', (await page.textContent('#statusPos')).startsWith('42 :'));

/* ---------- 文字コードを指定して開き直す ---------- */

await page.setInputFiles('#filePicker', sjisPath);
await page.waitForTimeout(400);
await page.click('#statusEncoding');
await page.waitForTimeout(200);
await page.selectOption('#reopenEncoding', 'euc-jp');
await page.click('#reopenDialog button[type="submit"]');
await page.waitForTimeout(300);
check('指定の文字コードで開き直せる', (await page.textContent('#statusEncoding')) === 'EUC-JP');
await page.click('#statusEncoding');
await page.selectOption('#reopenEncoding', 'shift_jis');
await page.click('#reopenDialog button[type="submit"]');
await page.waitForTimeout(300);
check('元の文字コードに戻せる', (await page.inputValue('#input')).includes('日本語の設定ファイル'));

/* ---------- 設定 ---------- */

await page.click('#btnSettings');
await page.waitForTimeout(150);
await page.check('#setWrap');
await page.selectOption('#setTabSize', '4');
await page.click('#fontLarger');
await page.selectOption('#setTheme', 'dark');
await page.click('#settingsClose');
await page.waitForTimeout(250);
check('折り返しを戻すと行番号が消える', !(await page.locator('#gutter').isVisible()));
check('テーマが切り替わる', (await page.getAttribute('html', 'data-theme')) === 'dark');

await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(400);
check('設定が再読込後も残る', (await page.getAttribute('html', 'data-theme')) === 'dark');
check('文字サイズも残る', (await page.evaluate(() => getComputedStyle(document.querySelector('#input')).fontSize)) === '16px');

/* ---------- PWA: オフラインと共有受け取り ---------- */

await page.evaluate(() => navigator.serviceWorker.ready);
await page.waitForTimeout(1200);
const cachedCount = await page.evaluate(async () => {
  const name = (await caches.keys()).find((n) => n.startsWith('justtext-app-'));
  return name ? (await (await caches.open(name)).keys()).length : 0;
});
check('アプリ一式がキャッシュされる', cachedCount >= 20, `${cachedCount} 件`);

await context.setOffline(true);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
check('オフラインでも起動する', await page.locator('#input').isVisible());
const offlineStatus = await page.evaluate(async () => {
  const ta = document.querySelector('#input');
  ta.value = 'オフライン編集';
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 200));
  return document.querySelector('#statusCount').textContent;
});
check('オフラインでも編集できる', offlineStatus.includes('7 文字'));
await context.setOffline(false);

const shared = await page.evaluate(async () => {
  const form = new FormData();
  form.append('file', new File(['{\n  "共有": "テスト"\n}\n'], '共有されたデータ.json', { type: 'application/json' }));
  const res = await fetch('./share-target', { method: 'POST', body: form, redirect: 'manual' });
  return res.type;
});
check('共有 POST を Service Worker が受ける', shared === 'opaqueredirect' || shared === 'basic');

await page.goto(`${BASE}?share=1`, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
check('共有されたファイルが開かれる', (await page.inputValue('#input')).includes('"共有": "テスト"'));
check('ファイル名も引き継がれる', (await page.textContent('#fileName')) === '共有されたデータ.json');
check('アドレスから share フラグが消える', (await page.evaluate(() => location.search)) === '');

check('通しでブラウザのエラーが出ない', errors.length === 0, errors.slice(0, 3).join(' | '));

/* ---------- 後片付け ---------- */

await browser.close();
stopServer();

const failed = results.filter((r) => !r.ok);
console.log('-'.repeat(46));
console.log(`${results.length - failed.length}/${results.length} 件 通過`);
if (failed.length > 0) {
  console.log('失敗:', failed.map((f) => f.name).join(' / '));
  process.exit(1);
}
