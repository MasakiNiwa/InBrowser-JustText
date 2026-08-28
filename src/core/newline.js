/**
 * 改行コードの判別と変換。
 *
 * textarea の value は仕様上つねに LF なので、
 * 「読み込み時に LF へ正規化 → 保存時に元の改行へ戻す」という流れにする。
 */

export const NEWLINES = [
  { name: 'lf', short: 'LF', value: '\n' },
  { name: 'crlf', short: 'CRLF', value: '\r\n' },
  { name: 'cr', short: 'CR', value: '\r' },
];

/** 最も多く使われている改行コードを返す。改行が無ければ 'lf'。 */
export function detectNewline(text) {
  let crlf = 0;
  let lf = 0;
  let cr = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '\r') {
      if (text[i + 1] === '\n') {
        crlf++;
        i++;
      } else {
        cr++;
      }
    } else if (c === '\n') {
      lf++;
    }
  }
  if (crlf === 0 && lf === 0 && cr === 0) return 'lf';
  if (crlf >= lf && crlf >= cr) return 'crlf';
  if (lf >= cr) return 'lf';
  return 'cr';
}

/** すべての改行を LF に揃える。 */
export function normalizeToLf(text) {
  return text.replace(/\r\n?/g, '\n');
}

/** LF のテキストを指定の改行コードに変換する。 */
export function applyNewline(text, name) {
  const nl = NEWLINES.find((n) => n.name === name)?.value ?? '\n';
  return nl === '\n' ? text : text.replace(/\n/g, nl);
}

/** 画面の狭い場所に出す短縮名（LF / CRLF / CR）。どの言語でも同じ。 */
export function newlineShort(name) {
  return NEWLINES.find((n) => n.name === name)?.short ?? name;
}
