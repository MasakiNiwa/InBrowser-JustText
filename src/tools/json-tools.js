/**
 * JSON commands: format, minify, check.
 */

import { t } from '../i18n/index.js';
import { register } from './registry.js';

/**
 * Walks JSON once and reports everything the commands need to know:
 * where the syntax first goes wrong, every number literal, and the first key
 * that appears twice in the same object.
 *
 * The walking is done here rather than read out of JSON.parse's error, because
 * every engine words that differently — Chrome says "at position 18", Firefox
 * "at line 3 column 7", Safari sometimes gives no position at all. Walking it
 * ourselves points at the same character everywhere, and the last two are
 * things JSON.parse quietly swallows rather than reports.
 *
 * @returns {{error:number|null, numbers:{start:number,end:number}[],
 *            duplicateKey:{offset:number, name:string}|null}}
 */
export function scanJson(text) {
  let i = 0;
  const n = text.length;
  const numbers = [];
  let duplicateKey = null;

  /** Where it went wrong. A null result means it did not. */
  const fail = (at = i) => Math.min(at, n);

  /** Where the string just scanned sat, so an object key can be read back. */
  let lastStringSpan = null;

  /** Reads a scanned string span. It has been validated, so parsing is safe. */
  function readString(span) {
    if (!span) return null;
    try {
      return JSON.parse(text.slice(span.start, span.end));
    } catch {
      return null;
    }
  }

  function skipSpace() {
    while (i < n) {
      const c = text[i];
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') i++;
      else break;
    }
  }

  /** Scans a string, and hands back where it sat so the caller can read it. */
  function scanString() {
    const from = i;
    i++; // the opening quote
    while (i < n) {
      const c = text[i];
      if (c === '"') {
        i++;
        lastStringSpan = { start: from, end: i };
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
    const from = i;
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
    numbers.push({ start: from, end: i });
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
    // Repeats matter: JSON.parse keeps the last and drops the rest without a word.
    const seen = new Set();
    for (;;) {
      skipSpace();
      if (text[i] !== '"') return fail();
      const keyAt = i;
      const key = scanString();
      if (key !== null) return key;
      const name = readString(lastStringSpan);
      if (name !== null) {
        if (seen.has(name) && duplicateKey === null) duplicateKey = { offset: keyAt, name };
        seen.add(name);
      }
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
  if (result !== null) return { error: result, numbers, duplicateKey };
  skipSpace();
  // Anything trailing the value is an error.
  return { error: i < n ? fail() : null, numbers, duplicateKey };
}

/** Where the syntax first goes wrong, or null when it does not. */
export function findErrorOffset(text) {
  return scanJson(text).error;
}

/**
 * A number literal's exact value, as a string that two literals share only when
 * they mean the same number. `1`, `1.0` and `1e0` all come out the same; a
 * literal too precise for a double does not match what a double writes back.
 *
 * The form is "digits e point", meaning 0.digits × 10^point.
 */
function exactValueOf(literal) {
  const parts = /^(-?)(\d+)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(literal);
  if (!parts) return literal;
  const [, sign, whole, fraction = '', exponent = '0'] = parts;

  let digits = whole + fraction;
  let point = whole.length + Number(exponent);

  let lead = 0;
  while (lead < digits.length && digits[lead] === '0') lead++;
  digits = digits.slice(lead);
  point -= lead;

  let end = digits.length;
  while (end > 0 && digits[end - 1] === '0') end--;
  digits = digits.slice(0, end);

  if (digits === '') return '0';
  return `${sign}${digits}e${point}`;
}

/**
 * Whether a number literal comes back unchanged after a trip through a double.
 * `9007199254740993` does not — JavaScript has no way to hold it — and neither
 * does `1e999`, which becomes Infinity and is written out as null.
 */
export function numberSurvives(literal) {
  const value = Number(literal);
  if (!Number.isFinite(value)) return false;
  return exactValueOf(literal) === exactValueOf(String(value));
}

/**
 * Whether rewriting this JSON would change what it says, rather than only how
 * it is laid out. Reformatting goes through JSON.parse, which rounds numbers it
 * cannot hold and keeps only the last of any repeated key — both silently. A
 * text editor must not do that to somebody's config file, so the commands stop
 * instead and point at what is in the way.
 *
 * @returns {{reason:'number'|'duplicateKey', offset:number, detail:string}|null}
 */
export function findLossyRewrite(text) {
  const { error, numbers, duplicateKey } = scanJson(text);
  if (error !== null) return null; // broken JSON is reported on its own terms
  for (const span of numbers) {
    const literal = text.slice(span.start, span.end);
    if (!numberSurvives(literal)) return { reason: 'number', offset: span.start, detail: literal };
  }
  if (duplicateKey) return { reason: 'duplicateKey', offset: duplicateKey.offset, detail: duplicateKey.name };
  return null;
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
    // Object.create(null), not {}: assigning to `__proto__` on a plain object
    // sets the prototype instead of a property, and the key would vanish.
    const out = Object.create(null);
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

/**
 * Shared handling for the JSON commands.
 * Anything that would change the data rather than its layout stops the command,
 * and the caret goes to whatever is in the way — as it does for a syntax error.
 */
function applyJson(ctx, fn, label) {
  const text = ctx.getText();
  const lossy = findLossyRewrite(text);
  if (lossy) {
    ctx.setSelection(lossy.offset, lossy.offset, { reveal: true });
    ctx.notify(t(`json.${lossy.reason}Unsafe`, { detail: lossy.detail }), 'error');
    return false;
  }
  const result = fn(text);
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
    const text = ctx.getText();
    const result = parseJson(text);
    if (!result.ok) {
      if (result.offset != null) ctx.setSelection(result.offset, result.offset, { reveal: true });
      ctx.notify(t('json.error', { detail: result.message }), 'error');
      return;
    }
    // Valid, but there may still be something here that no reformatting could
    // survive. Better to hear about it now than to find it changed later.
    const lossy = findLossyRewrite(text);
    if (lossy) {
      ctx.setSelection(lossy.offset, lossy.offset, { reveal: true });
      ctx.notify(t(`json.${lossy.reason}Unsafe`, { detail: lossy.detail }), 'error');
      return;
    }
    ctx.notify(t('json.valid'));
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
