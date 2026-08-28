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
  label: '行末の空白を削除',
  lineTransform: trimTrailing,
});

register({
  id: 'text.removeEmptyLines',
  group: 'line',
  label: '空行を削除',
  lineTransform: removeEmptyLines,
});

register({
  id: 'line.sortAsc',
  group: 'line',
  label: '行を昇順で並べ替え',
  lineTransform: (text) => sortLines(text, { numeric: true }),
});

register({
  id: 'line.sortDesc',
  group: 'line',
  label: '行を降順で並べ替え',
  lineTransform: (text) => sortLines(text, { descending: true, numeric: true }),
});

register({
  id: 'line.unique',
  group: 'line',
  label: '重複行を削除',
  lineTransform: uniqueLines,
});

register({
  id: 'text.tabsToSpaces',
  group: 'text',
  label: 'タブ → 空白',
  run: (ctx) => ctx.applyToSelectedLines((t) => tabsToSpaces(t, ctx.settings.tabSize), 'タブ → 空白'),
});

register({
  id: 'text.spacesToTabs',
  group: 'text',
  label: '行頭の空白 → タブ',
  run: (ctx) => ctx.applyToSelectedLines((t) => spacesToTabs(t, ctx.settings.tabSize), '空白 → タブ'),
});

register({
  id: 'text.indent',
  group: 'text',
  label: 'インデントを深くする',
  run: (ctx) => ctx.applyToSelectedLines((t) => indentLines(t, ctx.indentUnit()), 'インデント'),
});

register({
  id: 'text.outdent',
  group: 'text',
  label: 'インデントを浅くする',
  run: (ctx) => ctx.applyToSelectedLines((t) => outdentLines(t, ctx.indentUnit()), 'アンインデント'),
});
