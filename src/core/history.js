/**
 * Undo and redo.
 *
 * Android soft keyboards have no Ctrl+Z, so the stack is kept here rather than
 * left to the browser's own undo. The entry at the current index is always the
 * text as it stands.
 */

const DEFAULT_LIMIT = 300;
const DEFAULT_BUDGET = 32 * 1024 * 1024; // a rough ceiling, counted in characters
const COALESCE_MS = 600;

export class History {
  constructor({ limit = DEFAULT_LIMIT, budget = DEFAULT_BUDGET } = {}) {
    this.limit = limit;
    this.budget = budget;
    this.reset({ text: '', selectionStart: 0, selectionEnd: 0 });
  }

  /** Throws the history away and starts over — on opening a file, say. */
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
   * Records a change.
   * When `key` matches the last one and little time has passed, the two collapse
   * into a single step, so a run of typing undoes as one.
   */
  record(state, { key = null, now = Date.now() } = {}) {
    const top = this.stack[this.index];
    if (top && top.text === state.text) {
      // Same text: only the caret moved.
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
      this.stack.length = this.index + 1; // drop anything that could be redone
      this.stack.push({ ...state });
      this.index = this.stack.length - 1;
      this.size += state.text.length;
    }
    this.coalesceKey = key;
    this.coalesceAt = now;
    this.trim();
    return true;
  }

  /** Drops the oldest steps once the count or the total size runs over. */
  trim() {
    while (this.stack.length > 1 && (this.stack.length > this.limit || this.size > this.budget)) {
      if (this.index === 0) break; // never drop where we are now
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

  /** Makes the next record start a fresh step instead of joining this one. */
  breakCoalesce() {
    this.coalesceKey = null;
  }
}
