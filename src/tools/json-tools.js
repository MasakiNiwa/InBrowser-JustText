/**
 * JSON 用のコマンド。整形・最小化・検証。
 */

import { t } from '../i18n/index.js';
import { register } from './registry.js';

/**
 * JSON を走査して、最初に構文が壊れている位置を返す。壊れていなければ null。
 *
 * JSON.parse のエラーメッセージは、位置の書き方がブラウザごとに違ううえ
 * （Chrome は "at position 18"、Firefox は "at line 3 column 7"、
 * Safari は位置を書かないことがある）、位置を含まない場合もある。
 * どの環境でも同じ場所を指すよう、走査は自前で行う。
 */
export function findErrorOffset(text) {
  let i = 0;
  const n = text.length;

  /** 失敗した位置。null なら成功。 */
  const fail = (at = i) => Math.min(at, n);

  function skipSpace() {
    while (i < n) {
      const c = text[i];
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') i++;
      else break;
    }
  }

  function scanString() {
    i++; // 開きの "
    while (i < n) {
      const c = text[i];
      if (c === '"') {
        i++;
        return null;
      }
      if (c === '\\') {
        i++;
        if (i >= n) return fail();
        const escape = text[i];
        if (!'"\\/bfnrtu'.includes(escape)) return fail();
        if (escape === 'u') {
          for (let k = 1; k <= 4; k++) {
            if (i + k >= n || !/[0-9a-fA-F]/.test(text[i + k])) return fail(i + k);
          }
          i += 4;
        }
        i++;
        continue;
      }
      // 生の制御文字は文字列に入れられない
      if (c.charCodeAt(0) < 0x20) return fail();
      i++;
    }
    return fail(n); // 閉じられていない
  }

  function scanDigits() {
    const from = i;
    while (i < n && text[i] >= '0' && text[i] <= '9') i++;
    return i > from;
  }

  function scanNumber() {
    if (text[i] === '-') i++;
    if (text[i] === '0') i++;
    else if (!scanDigits()) return fail();
    if (text[i] === '.') {
      i++;
      if (!scanDigits()) return fail();
    }
    if (text[i] === 'e' || text[i] === 'E') {
      i++;
      if (text[i] === '+' || text[i] === '-') i++;
      if (!scanDigits()) return fail();
    }
    return null;
  }

  function scanLiteral(word) {
    if (text.startsWith(word, i)) {
      i += word.length;
      return null;
    }
    return fail();
  }

  function scanObject() {
    i++; // {
    skipSpace();
    if (text[i] === '}') {
      i++;
      return null;
    }
    for (;;) {
      skipSpace();
      if (text[i] !== '"') return fail();
      const key = scanString();
      if (key !== null) return key;
      skipSpace();
      if (text[i] !== ':') return fail();
      i++;
      const value = scanValue();
      if (value !== null) return value;
      skipSpace();
      if (text[i] === ',') {
        i++;
        continue;
      }
      if (text[i] === '}') {
        i++;
        return null;
      }
      return fail();
    }
  }

  function scanArray() {
    i++; // [
    skipSpace();
    if (text[i] === ']') {
      i++;
      return null;
    }
    for (;;) {
      const value = scanValue();
      if (value !== null) return value;
      skipSpace();
      if (text[i] === ',') {
        i++;
        continue;
      }
      if (text[i] === ']') {
        i++;
        return null;
      }
      return fail();
    }
  }

  function scanValue() {
    skipSpace();
    if (i >= n) return fail();
    const c = text[i];
    if (c === '{') return scanObject();
    if (c === '[') return scanArray();
    if (c === '"') return scanString();
    if (c === '-' || (c >= '0' && c <= '9')) return scanNumber();
    if (c === 't') return scanLiteral('true');
    if (c === 'f') return scanLiteral('false');
    if (c === 'n') return scanLiteral('null');
    return fail();
  }

  const result = scanValue();
  if (result !== null) return result;
  skipSpace();
  return i < n ? fail() : null; // 値のあとに余計なものが続いていないか
}

/**
 * JSON を解析する。失敗時は例外ではなく結果オブジェクトを返す。
 * @returns {{ok:true, value:any} | {ok:false, message:string, offset:number|null}}
 */
export function parseJson(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (e) {
    return { ok: false, message: e.message, offset: findErrorOffset(text) };
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
    ctx.notify(t('json.parseFailed', { detail: result.message }), 'error');
    return false;
  }
  ctx.setText(result.text, { label });
  return true;
}

register({
  id: 'json.format2',
  group: 'json',
  label: 'cmd.json.format2',
  run: (ctx) => {
    if (applyJson(ctx, (t) => formatJson(t, 2), 'cmd.json.format2')) ctx.notify(t('json.formatted'));
  },
});

register({
  id: 'json.format4',
  group: 'json',
  label: 'cmd.json.format4',
  run: (ctx) => {
    if (applyJson(ctx, (t) => formatJson(t, 4), 'cmd.json.format2')) ctx.notify(t('json.formatted'));
  },
});

register({
  id: 'json.formatTab',
  group: 'json',
  label: 'cmd.json.formatTab',
  run: (ctx) => {
    if (applyJson(ctx, (t) => formatJson(t, '\t'), 'cmd.json.format2')) ctx.notify(t('json.formatted'));
  },
});

register({
  id: 'json.minify',
  group: 'json',
  label: 'cmd.json.minify',
  hint: 'cmd.json.minifyHint',
  run: (ctx) => {
    if (applyJson(ctx, minifyJson, 'cmd.json.minify')) ctx.notify(t('json.minified'));
  },
});

register({
  id: 'json.validate',
  group: 'json',
  label: 'cmd.json.validate',
  hint: 'cmd.json.validateHint',
  run: (ctx) => {
    const result = parseJson(ctx.getText());
    if (result.ok) {
      ctx.notify(t('json.valid'));
      return;
    }
    if (result.offset != null) ctx.setSelection(result.offset, result.offset, { reveal: true });
    ctx.notify(t('json.error', { detail: result.message }), 'error');
  },
});
