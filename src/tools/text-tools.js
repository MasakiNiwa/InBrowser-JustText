/**
 * Commands that tidy text up.
 *
 * A command with a lineTransform runs over the selected lines, or over
 * everything when nothing is selected. Adding a function here is enough to put
 * it in the menu.
 */

import { expandToLines } from '../core/position.js';
import { getLocale, t } from '../i18n/index.js';
import { register } from './registry.js';

/** Strips the trailing whitespace from every line. */
export function trimTrailing(text) {
  return text.replace(/[ \t]+$/gm, '');
}

/** Removes blank lines, including ones holding only whitespace. */
export function removeEmptyLines(text) {
  return text
    .split('\n')
    .filter((line) => line.trim() !== '')
    .join('\n');
}

/**
 * Sorts the lines. With `numeric`, digit runs compare as numbers.
 * The ordering follows the interface language, so each reader gets the one they
 * would expect.
 */
export function sortLines(text, { descending = false, numeric = false } = {}) {
  const lines = text.split('\n');
  const collator = new Intl.Collator(getLocale(), { numeric, sensitivity: 'variant' });
  lines.sort((a, b) => collator.compare(a, b));
  if (descending) lines.reverse();
  return lines.join('\n');
}

/** Drops repeated lines, keeping the first of each in place. */
export function uniqueLines(text) {
  const seen = new Set();
  return text
    .split('\n')
    .filter((line) => (seen.has(line) ? false : (seen.add(line), true)))
    .join('\n');
}

/** Turns tabs into spaces. */
export function tabsToSpaces(text, width = 2) {
  return text.replace(/\t/g, ' '.repeat(width));
}

/** Turns leading spaces into tabs. */
export function spacesToTabs(text, width = 2) {
  const re = new RegExp(` {${width}}`, 'g');
  return text.replace(/^[ \t]+/gm, (indent) => indent.replace(re, '\t'));
}

/** Indents every line by one step. */
export function indentLines(text, unit = '  ') {
  return text.replace(/^/gm, unit);
}

/** Removes one step of indent from every line. */
export function outdentLines(text, unit = '  ') {
  const re = new RegExp(`^(?:${unit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}|\\t| {1,${unit.length}})`, 'gm');
  return text.replace(re, '');
}

/*
 * The commands below work on whole lines around the caret rather than on a
 * selection, so each returns the new text together with where the selection
 * should end up. They stay pure, which is what lets the tests drive them.
 */

/** Copies the lines the selection touches, putting the copy just below. */
export function duplicateLines(text, start, end) {
  const range = expandToLines(text, start, end);
  const block = text.slice(range.start, range.end);
  const next = `${text.slice(0, range.end)}\n${block}${text.slice(range.end)}`;
  const shift = block.length + 1;
  return { text: next, start: start + shift, end: end + shift };
}

/** Removes the lines the selection touches, along with one line break. */
export function deleteLines(text, start, end) {
  const range = expandToLines(text, start, end);
  // Take the break that belongs to the block: the one after it, or — for the
  // last line, which has none — the one before.
  let from = range.start;
  let to = range.end;
  if (to < text.length) to += 1;
  else if (from > 0) from -= 1;
  const next = text.slice(0, from) + text.slice(to);
  const caret = Math.min(from, next.length);
  return { text: next, start: caret, end: caret };
}

/**
 * Swaps the lines the selection touches with the line above or below.
 * Returns null at the top or the bottom, where there is nowhere to go.
 */
export function moveLines(text, start, end, direction) {
  const range = expandToLines(text, start, end);
  const block = text.slice(range.start, range.end);

  if (direction === 'up') {
    if (range.start === 0) return null;
    const aboveStart = text.lastIndexOf('\n', range.start - 2) + 1;
    const above = text.slice(aboveStart, range.start - 1);
    const next = `${text.slice(0, aboveStart)}${block}\n${above}${text.slice(range.end)}`;
    const shift = range.start - aboveStart;
    return { text: next, start: start - shift, end: end - shift };
  }

  if (range.end >= text.length) return null;
  let belowEnd = text.indexOf('\n', range.end + 1);
  if (belowEnd === -1) belowEnd = text.length;
  const below = text.slice(range.end + 1, belowEnd);
  const next = `${text.slice(0, range.start)}${below}\n${block}${text.slice(belowEnd)}`;
  const shift = below.length + 1;
  return { text: next, start: start + shift, end: end + shift };
}

register({
  id: 'text.trimTrailing',
  group: 'text',
  label: 'cmd.text.trimTrailing',
  lineTransform: trimTrailing,
});

register({
  id: 'text.removeEmptyLines',
  group: 'line',
  label: 'cmd.text.removeEmptyLines',
  lineTransform: removeEmptyLines,
});

register({
  id: 'line.sortAsc',
  group: 'line',
  label: 'cmd.line.sortAsc',
  lineTransform: (text) => sortLines(text, { numeric: true }),
});

register({
  id: 'line.sortDesc',
  group: 'line',
  label: 'cmd.line.sortDesc',
  lineTransform: (text) => sortLines(text, { descending: true, numeric: true }),
});

register({
  id: 'line.unique',
  group: 'line',
  label: 'cmd.line.unique',
  lineTransform: uniqueLines,
});

register({
  id: 'text.tabsToSpaces',
  group: 'text',
  label: 'cmd.text.tabsToSpaces',
  run: (ctx) => ctx.applyToSelectedLines((t) => tabsToSpaces(t, ctx.settings.tabSize), 'cmd.text.tabsToSpaces'),
});

register({
  id: 'text.spacesToTabs',
  group: 'text',
  label: 'cmd.text.spacesToTabs',
  run: (ctx) => ctx.applyToSelectedLines((t) => spacesToTabs(t, ctx.settings.tabSize), 'cmd.text.spacesToTabs'),
});

register({
  id: 'text.indent',
  group: 'text',
  label: 'cmd.text.indent',
  run: (ctx) => ctx.applyToSelectedLines((t) => indentLines(t, ctx.indentUnit()), 'cmd.text.indent'),
});

register({
  id: 'text.outdent',
  group: 'text',
  label: 'cmd.text.outdent',
  run: (ctx) => ctx.applyToSelectedLines((t) => outdentLines(t, ctx.indentUnit()), 'cmd.text.outdent'),
});

register({
  id: 'text.insertTab',
  group: 'text',
  label: 'cmd.text.insertTab',
  run: (ctx) => {
    const { start, end } = ctx.getSelection();
    const unit = ctx.indentUnit();
    const text = ctx.getText();
    ctx.setText(text.slice(0, start) + unit + text.slice(end), {
      selectionStart: start + unit.length,
      selectionEnd: start + unit.length,
      label: 'cmd.text.insertTab',
    });
  },
});

/** Runs one of the line commands above and moves the selection with it. */
function applyLineEdit(ctx, fn, label) {
  const { start, end } = ctx.getSelection();
  const result = fn(ctx.getText(), start, end);
  if (!result) {
    ctx.notify(t('common.noChange'));
    return;
  }
  ctx.setText(result.text, { selectionStart: result.start, selectionEnd: result.end, label });
  ctx.setSelection(result.start, result.end, { reveal: true });
}

register({
  id: 'line.duplicate',
  group: 'line',
  label: 'cmd.line.duplicate',
  run: (ctx) => applyLineEdit(ctx, duplicateLines, 'cmd.line.duplicate'),
});

register({
  id: 'line.delete',
  group: 'line',
  label: 'cmd.line.delete',
  run: (ctx) => applyLineEdit(ctx, deleteLines, 'cmd.line.delete'),
});

register({
  id: 'line.moveUp',
  group: 'line',
  label: 'cmd.line.moveUp',
  run: (ctx) => applyLineEdit(ctx, (t, s, e) => moveLines(t, s, e, 'up'), 'cmd.line.moveUp'),
});

register({
  id: 'line.moveDown',
  group: 'line',
  label: 'cmd.line.moveDown',
  run: (ctx) => applyLineEdit(ctx, (t, s, e) => moveLines(t, s, e, 'down'), 'cmd.line.moveDown'),
});
