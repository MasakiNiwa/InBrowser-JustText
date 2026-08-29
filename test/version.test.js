import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { APP_VERSION } from '../src/version.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));
const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf-8');

test('package.json と画面に出す版が揃っている', () => {
  assert.equal(pkg.version, APP_VERSION);
});

test('版の書き方が揃っている', () => {
  assert.match(APP_VERSION, /^\d+\.\d+\.\d+$/);
});

test('キャッシュに載せるファイルが実在する', async () => {
  const listed = [...sw.matchAll(/'\.\/([^']+)'/g)].map((m) => m[1]).filter((p) => p.endsWith('.js') || p.endsWith('.css') || p.endsWith('.html') || p.endsWith('.webmanifest') || p.endsWith('.svg'));
  assert.ok(listed.length > 30, `${listed.length} 件しか列挙されていません`);
  for (const path of listed) {
    assert.doesNotThrow(() => readFileSync(new URL(`../${path}`, import.meta.url)), `${path} がありません`);
  }
});

test('読み込むモジュールがすべてキャッシュ対象に入っている', async () => {
  // オフラインで動かなくなるのを防ぐため、src/ 以下の JS はすべて列挙しておく
  const { readdirSync } = await import('node:fs');
  const walk = (dir, prefix) => readdirSync(new URL(dir, import.meta.url), { withFileTypes: true })
    .flatMap((entry) => (entry.isDirectory()
      ? walk(`${dir}${entry.name}/`, `${prefix}${entry.name}/`)
      : entry.name.endsWith('.js') ? [`${prefix}${entry.name}`] : []));
  const files = walk('../src/', 'src/');
  const missing = files.filter((file) => !sw.includes(`'./${file}'`));
  assert.deepEqual(missing, [], `sw.js の APP_SHELL に無いファイル: ${missing.join(', ')}`);
});
