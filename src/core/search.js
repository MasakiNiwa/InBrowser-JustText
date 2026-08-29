/**
 * The find-and-replace engine. Knows nothing about the DOM.
 *
 * Every query becomes a RegExp first. A plain search is escaped into one too,
 * so everything downstream has a single kind of thing to work with.
 */

export class SearchError extends Error {
  /**
   * @param {string} message for developers
   * @param {string} detail shown to the reader — the browser's own wording
   */
  constructor(message, detail = message) {
    super(message);
    this.name = 'SearchError';
    /** Translation key for the interface to look up. */
    this.code = 'search.invalidRegex';
    this.detail = detail;
  }
}

/** Escapes the regular-expression metacharacters. */
export function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function wrapWholeWord(source, unicode) {
  const w = unicode ? '[\\p{L}\\p{N}_]' : '[A-Za-z0-9_]';
  return `(?<!${w})(?:${source})(?!${w})`;
}

/**
 * Builds the RegExp for a query, or null when the query is empty.
 * Unicode mode is tried first, and only a pattern the `u` flag rejects falls
 * back to the older behaviour.
 */
export function createMatcher({ query, useRegex = false, caseSensitive = false, wholeWord = false } = {}) {
  if (!query) return null;
  const base = useRegex ? query : escapeRegExp(query);
  const flags = caseSensitive ? 'gd' : 'gdi';

  try {
    return new RegExp(wholeWord ? wrapWholeWord(base, true) : base, flags + 'u');
  } catch {
    // Patterns the u flag will not take (\- and friends) are read as they are.
  }
  try {
    return new RegExp(wholeWord ? wrapWholeWord(base, false) : base, flags);
  } catch (e) {
    throw new SearchError(`invalid pattern: ${e.message}`, e.message);
  }
}

/** Nudges lastIndex along so a zero-length match cannot stall the loop. */
function stepEmpty(re, m) {
  if (m[0].length === 0) re.lastIndex = m.index + 1;
}

/**
 * Returns every match. Stops at `limit` and reports truncated=true, which keeps
 * a huge file from spending all its time drawing highlights.
 */
export function findAll(text, re, limit = Infinity) {
  const matches = [];
  if (!re) return { matches, truncated: false };
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    matches.push({ start: m.index, end: m.index + m[0].length });
    stepEmpty(re, m);
    if (matches.length >= limit) return { matches, truncated: re.lastIndex < text.length };
  }
  return { matches, truncated: false };
}

/** The first match at or after `from`. With wrap, the end leads back to the start. */
export function findNext(text, re, from = 0, { wrap = true } = {}) {
  if (!re) return null;
  re.lastIndex = Math.max(0, Math.min(from, text.length));
  let m = re.exec(text);
  // A zero-length match right at `from` would never move, so step past it and retry.
  if (m && m[0].length === 0 && m.index === from) {
    re.lastIndex = from + 1;
    m = re.exec(text);
  }
  if (!m && wrap) {
    re.lastIndex = 0;
    m = re.exec(text);
  }
  return m ? { start: m.index, end: m.index + m[0].length } : null;
}

/** The last match before `from`. With wrap, the start leads back to the end. */
export function findPrev(text, re, from = 0, { wrap = true } = {}) {
  if (!re) return null;
  const { matches } = findAll(text, re);
  if (matches.length === 0) return null;
  for (let i = matches.length - 1; i >= 0; i--) {
    if (matches[i].end <= from) return matches[i];
  }
  return wrap ? matches[matches.length - 1] : null;
}

/**
 * Expands $&, $1, $<name> and the rest inside a replacement.
 * Same notation as String.prototype.replace, written out here so that the
 * replacements can be counted as they are made.
 */
export function expandReplacement(m, replacement) {
  return replacement.replace(/\$(\$|&|`|'|<[^>]*>|\d{1,2})/g, (all, token) => {
    if (token === '$') return '$';
    if (token === '&') return m[0];
    if (token === '`') return m.input.slice(0, m.index);
    if (token === "'") return m.input.slice(m.index + m[0].length);
    if (token.startsWith('<')) {
      const name = token.slice(1, -1);
      return m.groups?.[name] ?? '';
    }
    const n = Number(token);
    // With no group 12, "$12" reads as group 1 followed by a literal "2".
    if (n >= 1 && n < m.length) return m[n] ?? '';
    const first = Number(token[0]);
    if (token.length === 2 && first >= 1 && first < m.length) return (m[first] ?? '') + token[1];
    return all;
  });
}

/** In regex mode, turns \n \t \r \\ in the replacement into real characters. */
export function unescapeReplacement(str) {
  return str.replace(/\\([nrt\\])/g, (all, c) =>
    c === 'n' ? '\n' : c === 'r' ? '\r' : c === 't' ? '\t' : '\\');
}

/** Prepares the replacement text for the mode being searched in. */
export function prepareReplacement(replacement, useRegex) {
  // A plain search gives $ no special meaning.
  return useRegex ? unescapeReplacement(replacement) : replacement.replace(/\$/g, '$$$$');
}

/**
 * Replaces every match, building the result in one pass and counting as it goes.
 * `delta` is how much longer the text became.
 */
export function replaceAll(text, re, replacement) {
  if (!re) return { text, count: 0, delta: 0 };
  const parts = [];
  let last = 0;
  let count = 0;
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    parts.push(text.slice(last, m.index), expandReplacement(m, replacement));
    last = m.index + m[0].length;
    count++;
    stepEmpty(re, m);
    if (re.lastIndex <= m.index && m[0].length === 0) break;
  }
  if (count === 0) return { text, count: 0, delta: 0 };
  parts.push(text.slice(last));
  const result = parts.join('');
  return { text: result, count, delta: result.length - text.length };
}

/**
 * Replaces just the match at `start`, or returns null when nothing matches
 * exactly there. `end` is where that match now ends in the new text, which is
 * where the next search should begin.
 */
export function replaceOne(text, re, replacement, start) {
  if (!re) return null;
  re.lastIndex = start;
  const m = re.exec(text);
  if (!m || m.index !== start) return null;
  const replaced = expandReplacement(m, replacement);
  return {
    text: text.slice(0, m.index) + replaced + text.slice(m.index + m[0].length),
    start: m.index,
    end: m.index + replaced.length,
  };
}
