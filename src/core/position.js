/**
 * Converting between character offsets and line/column positions.
 *
 * So that moving the caret in a large file does not rescan everything, an index
 * of line-start offsets is built once and searched with a binary search.
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

  /** The number of lines. A trailing newline counts the empty line after it. */
  get lineCount() {
    return this.starts.length;
  }

  /** The line an offset falls on, counting from 1. */
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

  /** The column an offset falls on, counting from 1. */
  columnAt(offset) {
    const line = this.lineAt(offset);
    return Math.max(0, Math.min(offset, this.length)) - this.starts[line - 1] + 1;
  }

  /** The offset where a line starts, given a 1-based line number. */
  offsetAt(line, column = 1) {
    const l = Math.max(1, Math.min(line, this.starts.length));
    return Math.min(this.starts[l - 1] + Math.max(0, column - 1), this.length);
  }

  /** The range of a line, [start, end). The line ending is not included. */
  lineRange(line) {
    const start = this.offsetAt(line);
    const next = line < this.starts.length ? this.starts[line] : this.length + 1;
    return { start, end: Math.max(start, next - 1) };
  }
}

/**
 * Widens a range to cover the whole of every line it touches.
 * Used by the commands that work line by line.
 */
export function expandToLines(text, start, end) {
  let s = start;
  let e = end;
  while (s > 0 && text.charCodeAt(s - 1) !== 10) s--;
  while (e < text.length && text.charCodeAt(e) !== 10) e++;
  return { start: s, end: e };
}
