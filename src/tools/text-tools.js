/**
 * Commands that tidy text up.
 *
 * A command with a lineTransform runs over the selected lines, or over
 * everything when nothing is selected. Adding a function here is enough to put
 * it in the menu.
 */

import { getLocale } from '../i18n/index.js';
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
