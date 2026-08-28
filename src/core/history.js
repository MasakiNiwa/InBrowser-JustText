/**
 * 元に戻す / やり直す の履歴。
 *
 * Android のソフトキーボードには Ctrl+Z が無いので、ブラウザ標準の
 * undo に頼らず自前で持つ。スタックの先頭は常に「現在の内容」。
 */

const DEFAULT_LIMIT = 300;
const DEFAULT_BUDGET = 32 * 1024 * 1024; // 文字数換算のおおよその上限
const COALESCE_MS = 600;

export class History {
  constructor({ limit = DEFAULT_LIMIT, budget = DEFAULT_BUDGET } = {}) {
    this.limit = limit;
    this.budget = budget;
    this.reset({ text: '', selectionStart: 0, selectionEnd: 0 });
  }

  /** 履歴を破棄して初期状態にする（ファイルを開いた時など）。 */
  reset(state) {
    this.stack = [{ ...state }];
    this.index = 0;
    this.coalesceKey = null;
    this.coalesceAt = 0;
    this.size = state.text.length;
  }

  get canUndo() {
    return this.index > 0;
  }

  get canRedo() {
    return this.index < this.stack.length - 1;
  }

  get current() {
    return this.stack[this.index];
  }

  /**
   * 変更を記録する。
   * key が直前と同じで時間も近ければ 1 手にまとめる（連続入力用）。
   */
  record(state, { key = null, now = Date.now() } = {}) {
    const top = this.stack[this.index];
    if (top && top.text === state.text) {
      // 内容が同じならカーソル位置だけ更新する
      top.selectionStart = state.selectionStart;
      top.selectionEnd = state.selectionEnd;
      return false;
    }

    const mergeable =
      key !== null && key === this.coalesceKey && now - this.coalesceAt < COALESCE_MS && this.index === this.stack.length - 1;

    if (mergeable) {
      this.size += state.text.length - top.text.length;
      this.stack[this.index] = { ...state };
    } else {
      this.stack.length = this.index + 1; // やり直し分を捨てる
      this.stack.push({ ...state });
      this.index = this.stack.length - 1;
      this.size += state.text.length;
    }
    this.coalesceKey = key;
    this.coalesceAt = now;
    this.trim();
    return true;
  }

  /** 件数・総量の上限を超えた古い履歴を捨てる。 */
  trim() {
    while (this.stack.length > 1 && (this.stack.length > this.limit || this.size > this.budget)) {
      if (this.index === 0) break; // 現在位置は必ず残す
      this.size -= this.stack[0].text.length;
      this.stack.shift();
      this.index--;
    }
  }

  undo() {
    if (!this.canUndo) return null;
    this.index--;
    this.coalesceKey = null;
    return { ...this.stack[this.index] };
  }

  redo() {
    if (!this.canRedo) return null;
    this.index++;
    this.coalesceKey = null;
    return { ...this.stack[this.index] };
  }

  /** 次の record をまとめずに独立した 1 手として扱わせる。 */
  breakCoalesce() {
    this.coalesceKey = null;
  }
}
