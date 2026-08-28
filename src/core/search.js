/**
 * 検索と置換のエンジン（DOM 非依存）。
 *
 * 検索条件は一度 RegExp に落としてから使う。プレーン検索も
 * エスケープして正規表現化するので、以降の処理を一本化できる。
 */

export class SearchError extends Error {
  /**
   * @param {string} message 開発者向けの説明
   * @param {string} detail 画面に出す補足（ブラウザからのメッセージ）
   */
  constructor(message, detail = message) {
    super(message);
    this.name = 'SearchError';
    /** 画面側で翻訳するためのキー。 */
    this.code = 'search.invalidRegex';
    this.detail = detail;
  }
}

/** 正規表現のメタ文字をエスケープする。 */
export function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function wrapWholeWord(source, unicode) {
  const w = unicode ? '[\\p{L}\\p{N}_]' : '[A-Za-z0-9_]';
  return `(?<!${w})(?:${source})(?!${w})`;
}

/**
 * 検索条件から RegExp を作る。query が空なら null。
 * まず Unicode モードで組み立て、利用者の正規表現が u フラグと
 * 相容れない場合だけ従来モードにフォールバックする。
 */
export function createMatcher({ query, useRegex = false, caseSensitive = false, wholeWord = false } = {}) {
  if (!query) return null;
  const base = useRegex ? query : escapeRegExp(query);
  const flags = caseSensitive ? 'gd' : 'gdi';

  try {
    return new RegExp(wholeWord ? wrapWholeWord(base, true) : base, flags + 'u');
  } catch {
    // u フラグ非対応のパターン（\- など）はそのまま解釈する
  }
  try {
    return new RegExp(wholeWord ? wrapWholeWord(base, false) : base, flags);
  } catch (e) {
    throw new SearchError(`invalid pattern: ${e.message}`, e.message);
  }
}

/** 空マッチで停止しないように lastIndex を進める。 */
function stepEmpty(re, m) {
  if (m[0].length === 0) re.lastIndex = m.index + 1;
}

/**
 * すべての一致位置を返す。limit を超えた分は打ち切り、
 * truncated=true を返す（巨大ファイルでの描画コスト対策）。
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

/** from 以降で最初に一致する位置。wrap=true なら末尾で先頭に戻る。 */
export function findNext(text, re, from = 0, { wrap = true } = {}) {
  if (!re) return null;
  re.lastIndex = Math.max(0, Math.min(from, text.length));
  let m = re.exec(text);
  // 開始位置そのものでの空マッチは前進しないので 1 文字ぶん進めて取り直す
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

/** from より前で最後に一致する位置。wrap=true なら先頭で末尾に戻る。 */
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
 * 置換文字列内の $&, $1, $<name> などを実際の値に展開する。
 * String.prototype.replace と同じ記法を、件数を数えながら使いたいので自前で持つ。
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
    // $12 のような表記は、12 番の group が無ければ $1 + "2" と解釈する
    if (n >= 1 && n < m.length) return m[n] ?? '';
    const first = Number(token[0]);
    if (token.length === 2 && first >= 1 && first < m.length) return (m[first] ?? '') + token[1];
    return all;
  });
}

/** 正規表現モードの置換文字列で \n \t \r \\ を実文字として扱う。 */
export function unescapeReplacement(str) {
  return str.replace(/\\([nrt\\])/g, (all, c) =>
    c === 'n' ? '\n' : c === 'r' ? '\r' : c === 't' ? '\t' : '\\');
}

/** 検索条件に応じて置換文字列を前処理する。 */
export function prepareReplacement(replacement, useRegex) {
  // プレーン検索では $ を特別扱いしない
  return useRegex ? unescapeReplacement(replacement) : replacement.replace(/\$/g, '$$$$');
}

/**
 * すべて置換する。件数を数えつつ 1 パスで組み立てる。
 * 返り値の delta は「置換後の長さ − 置換前の長さ」。
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
 * start 位置の一致だけを置換する。位置がずれていれば null。
 * 返り値の end は置換後テキストでの終端位置（次の検索開始点に使う）。
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
