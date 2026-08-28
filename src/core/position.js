/**
 * 文字オフセット ⇔ 行・桁 の相互変換。
 *
 * 大きなファイルでもカーソル移動のたびに全走査しないよう、
 * 行頭オフセットの索引を作って二分探索する。
 */

export class LineIndex {
  constructor(text = '') {
    this.build(text);
  }

  build(text) {
    const starts = [0];
    for (let i = 0; i < text.length; i++) {
      if (text.charCodeAt(i) === 10) starts.push(i + 1);
    }
    this.starts = starts;
    this.length = text.length;
  }

  /** 行数（末尾が改行なら、その後ろの空行も 1 行と数える）。 */
  get lineCount() {
    return this.starts.length;
  }

  /** オフセットの行番号（1 始まり）。 */
  lineAt(offset) {
    const o = Math.max(0, Math.min(offset, this.length));
    let lo = 0;
    let hi = this.starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.starts[mid] <= o) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  }

  /** オフセットの桁（1 始まり）。 */
  columnAt(offset) {
    const line = this.lineAt(offset);
    return Math.max(0, Math.min(offset, this.length)) - this.starts[line - 1] + 1;
  }

  /** 行頭のオフセット（1 始まりの行番号）。 */
  offsetAt(line, column = 1) {
    const l = Math.max(1, Math.min(line, this.starts.length));
    return Math.min(this.starts[l - 1] + Math.max(0, column - 1), this.length);
  }

  /** 行の範囲 [start, end)。end は改行を含まない。 */
  lineRange(line) {
    const start = this.offsetAt(line);
    const next = line < this.starts.length ? this.starts[line] : this.length + 1;
    return { start, end: Math.max(start, next - 1) };
  }
}

/**
 * オフセット範囲を「その範囲を含む行全体」に広げる。
 * 行単位の整形コマンドで使う。
 */
export function expandToLines(text, start, end) {
  let s = start;
  let e = end;
  while (s > 0 && text.charCodeAt(s - 1) !== 10) s--;
  while (e < text.length && text.charCodeAt(e) !== 10) e++;
  return { start: s, end: e };
}
