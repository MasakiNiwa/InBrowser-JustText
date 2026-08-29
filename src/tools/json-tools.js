/**
 * JSON commands: format, minify, check.
 */

import { t } from '../i18n/index.js';
import { register } from './registry.js';

/**
 * Scans JSON and returns where the syntax first goes wrong, or null when it
 * does not.
 *
 * The scanning is done here rather than read out of JSON.parse's error, because
 * every engine words that differently — Chrome says "at position 18", Firefox
 * "at line 3 column 7", Safari sometimes gives no position at all. Scanning
 * ourselves points at the same character everywhere.
 */
export function findErrorOffset(text) {
  let i = 0;
  const n = text.length;

  /** Where it went wrong. A null result means it did not. */
  const fail = (at = i) => Math.min(at, n);

  function skipSpace() {
    while (i < n) {
      const c = text[i];
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') i++;
      else break;
    }
  }

  function scanString() {
    i++; // the opening quote
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
      // A raw control character cannot appear inside a string.
      if (c.charCodeAt(0) < 0x20) return fail();
      i++;
    }
    return fail(n); // never closed
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
  return i < n ? fail() : null; // anything trailing the value is an error
}

/**
 * Parses JSON, reporting failure as a result rather than an exception.
 * @returns {{ok:true, value:any} | {ok:false, message:string, offset:number|null}}
 */
export function parseJson(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (e) {
    return { ok: false, message: e.message, offset: findErrorOffset(text) };
  }
}

/** Formats. `indent` is a number of spaces, or '\t'. */
export function formatJson(text, indent = 2) {
  const parsed = parseJson(text);
  if (!parsed.ok) return parsed;
  return { ok: true, text: JSON.stringify(parsed.value, null, indent) };
}

/** Puts every object's keys in order, all the way down. */
function withSortedKeys(value) {
  if (Array.isArray(value)) return value.map(withSortedKeys);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = withSortedKeys(value[key]);
    return out;
  }
  return value;
}

/**
 * Formats with every object's keys in order.
 * Two config files that differ only in the order they were written then compare
 * line for line, which is what makes a diff worth reading.
 */
export function sortJsonKeys(text, indent = 2) {
  const parsed = parseJson(text);
  if (!parsed.ok) return parsed;
  return { ok: true, text: JSON.stringify(withSortedKeys(parsed.value), null, indent) };
}

/** Minifies, dropping all the whitespace. */
export function minifyJson(text) {
  const parsed = parseJson(text);
  if (!parsed.ok) return parsed;
  return { ok: true, text: JSON.stringify(parsed.value) };
}

/** Shared handling for the JSON commands. On failure the caret goes to the error. */
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

register({
  id: 'json.sortKeys',
  group: 'json',
  label: 'cmd.json.sortKeys',
  hint: 'cmd.json.sortKeysHint',
  run: (ctx) => {
    if (applyJson(ctx, (text) => sortJsonKeys(text, 2), 'cmd.json.sortKeys')) ctx.notify(t('json.sorted'));
  },
});
