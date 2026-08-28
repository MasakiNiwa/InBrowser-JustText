/**
 * JSON 用のコマンド。整形・最小化・検証。
 */

import { register } from './registry.js';

/** エラー位置（"position 123" 等）をメッセージから拾う。 */
export function parseErrorOffset(message) {
  const m = /position (\d+)/.exec(message);
  return m ? Number(m[1]) : null;
}

/** 二分探索でエラー位置を探す上限。これを超える入力では諦める。 */
const BISECT_LIMIT = 2 * 1024 * 1024;

/** 「まだ途中で切れているだけ」を表すエラーか。 */
function isTruncationError(message, length) {
  if (/Unexpected end of (?:JSON )?input|Unterminated string/.test(message)) return true;
  // 「位置が末尾」のエラーも、入力が尽きただけとみなす
  //（V8 は "Expected ',' or ']' after array element in JSON at position 9" のように報告する）
  const position = parseErrorOffset(message);
  return position !== null && position >= length;
}

/** 先頭 length 文字だけを見て、明確に壊れているか。 */
function isBrokenPrefix(text, length) {
  try {
    JSON.parse(text.slice(0, length));
    return false;
  } catch (e) {
    return !isTruncationError(e.message, length);
  }
}

/**
 * エラー位置を自力で求める。
 *
 * JSON.parse は最初のエラーだけを報告するので、「先頭 n 文字が壊れているか」は
 * n について単調になる。その境目を二分探索すれば、メッセージに位置が
 * 含まれない場合（V8 の "Unexpected token 'x', ... is not valid JSON"）でも
 * 正確な位置が分かる。
 */
export function findErrorOffset(text) {
  if (text.length > BISECT_LIMIT) return null;
  if (!isBrokenPrefix(text, text.length)) return null;
  let low = 0;
  let high = text.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (isBrokenPrefix(text, mid)) high = mid;
    else low = mid + 1;
  }
  return Math.max(0, low - 1);
}

/**
 * JSON を解析する。失敗時は例外ではなく結果オブジェクトを返す。
 * @returns {{ok:true, value:any} | {ok:false, message:string, offset:number|null}}
 */
export function parseJson(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (e) {
    return { ok: false, message: e.message, offset: parseErrorOffset(e.message) ?? findErrorOffset(text) };
  }
}

/** 整形。indent は数値（スペース数）か '\t'。 */
export function formatJson(text, indent = 2) {
  const parsed = parseJson(text);
  if (!parsed.ok) return parsed;
  return { ok: true, text: JSON.stringify(parsed.value, null, indent) };
}

/** 最小化（空白を落とす）。 */
export function minifyJson(text) {
  const parsed = parseJson(text);
  if (!parsed.ok) return parsed;
  return { ok: true, text: JSON.stringify(parsed.value) };
}

/** JSON を扱うコマンドの共通処理。失敗時はエラー位置にカーソルを移す。 */
function applyJson(ctx, fn, label) {
  const result = fn(ctx.getText());
  if (!result.ok) {
    if (result.offset != null) ctx.setSelection(result.offset, result.offset, { reveal: true });
    ctx.notify(`JSON として解析できません: ${result.message}`, 'error');
    return false;
  }
  ctx.setText(result.text, { label });
  return true;
}

register({
  id: 'json.format2',
  group: 'json',
  label: 'JSON を整形（スペース 2）',
  run: (ctx) => {
    if (applyJson(ctx, (t) => formatJson(t, 2), 'JSON 整形')) ctx.notify('JSON を整形しました');
  },
});

register({
  id: 'json.format4',
  group: 'json',
  label: 'JSON を整形（スペース 4）',
  run: (ctx) => {
    if (applyJson(ctx, (t) => formatJson(t, 4), 'JSON 整形')) ctx.notify('JSON を整形しました');
  },
});

register({
  id: 'json.formatTab',
  group: 'json',
  label: 'JSON を整形（タブ）',
  run: (ctx) => {
    if (applyJson(ctx, (t) => formatJson(t, '\t'), 'JSON 整形')) ctx.notify('JSON を整形しました');
  },
});

register({
  id: 'json.minify',
  group: 'json',
  label: 'JSON を最小化',
  hint: '改行と空白を取り除く',
  run: (ctx) => {
    if (applyJson(ctx, minifyJson, 'JSON 最小化')) ctx.notify('JSON を最小化しました');
  },
});

register({
  id: 'json.validate',
  group: 'json',
  label: 'JSON を検証',
  hint: '内容は変えずに構文だけ確認する',
  run: (ctx) => {
    const result = parseJson(ctx.getText());
    if (result.ok) {
      ctx.notify('JSON として正しい形式です');
      return;
    }
    if (result.offset != null) ctx.setSelection(result.offset, result.offset, { reveal: true });
    ctx.notify(`JSON エラー: ${result.message}`, 'error');
  },
});
