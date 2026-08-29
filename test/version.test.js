import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { APP_VERSION } from '../src/version.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));
const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf-8');

test('package.json and the version on screen agree', () => {
  assert.equal(pkg.version, APP_VERSION);
});

test('the version is written the usual way', () => {
  assert.match(APP_VERSION, /^\d+\.\d+\.\d+$/);
});

test('every file listed for the cache exists', async () => {
  const listed = [...sw.matchAll(/'\.\/([^']+)'/g)].map((m) => m[1]).filter((p) => p.endsWith('.js') || p.endsWith('.css') || p.endsWith('.html') || p.endsWith('.webmanifest') || p.endsWith('.svg'));
  assert.ok(listed.length > 30, `only ${listed.length} files are listed`);
  for (const path of listed) {
    assert.doesNotThrow(() => readFileSync(new URL(`../${path}`, import.meta.url)), `${path} is missing`);
  }
});

test('every module the app loads is in the cache list', async () => {
  // Everything under src/ has to be listed, or the app breaks offline.
  const { readdirSync } = await import('node:fs');
  const walk = (dir, prefix) => readdirSync(new URL(dir, import.meta.url), { withFileTypes: true })
    .flatMap((entry) => (entry.isDirectory()
      ? walk(`${dir}${entry.name}/`, `${prefix}${entry.name}/`)
      : entry.name.endsWith('.js') ? [`${prefix}${entry.name}`] : []));
  const files = walk('../src/', 'src/');
  const missing = files.filter((file) => !sw.includes(`'./${file}'`));
  assert.deepEqual(missing, [], `missing from APP_SHELL in sw.js: ${missing.join(', ')}`);
});
