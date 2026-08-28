/**
 * テキスト整形コマンド。
 *
 * lineTransform を持つコマンドは「選択中の行（無選択なら全文）」に対して
 * 適用される。ここに関数を足せばメニューにも自動で並ぶ。
 */

import { register } from './registry.js';

/** 各行の末尾の空白を取り除く。 */
export function trimTrailing(text) {
  return text.replace(/[ \t]+$/gm, '');
}

/** 空行（空白だけの行を含む）を取り除く。 */
export function removeEmptyLines(text) {
  return text
    .split('\n')
    .filter((line) => line.trim() !== '')
    .join('\n');
}

/** 行を並べ替える。numeric=true なら数値として比較する。 */
export function sortLines(text, { descending = false, numeric = false } = {}) {
  const lines = text.split('\n');
  const collator = new Intl.Collator('ja', { numeric, sensitivity: 'variant' });
  lines.sort((a, b) => collator.compare(a, b));
  if (descending) lines.reverse();
  return lines.join('\n');
}

/** 重複行を取り除く（最初に現れた順序は保つ）。 */
export function uniqueLines(text) {
  const seen = new Set();
  return text
    .split('\n')
    .filter((line) => (seen.has(line) ? false : (seen.add(line), true)))
    .join('\n');
}

/** タブを空白に変換する。 */
export function tabsToSpaces(text, width = 2) {
  return text.replace(/\t/g, ' '.repeat(width));
}

/** 行頭の空白をタブに変換する。 */
export function spacesToTabs(text, width = 2) {
  const re = new RegExp(` {${width}}`, 'g');
  return text.replace(/^[ \t]+/gm, (indent) => indent.replace(re, '\t'));
}

/** 各行の先頭にインデントを足す。 */
export function indentLines(text, unit = '  ') {
  return text.replace(/^/gm, unit);
}

/** 各行の先頭からインデントを 1 段ぶん取り除く。 */
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
