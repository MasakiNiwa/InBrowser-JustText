import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { APP_VERSION } from '../src/version.js';

const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf-8');

/**
 * English is the repository's language, and Japanese is kept beside it as the
 * second one. These checks are what stop the Japanese half from quietly falling
 * behind: the pairs have to exist, point at each other, and cover the same
 * releases.
 */

test('the English and Japanese documents point at each other', () => {
  const pairs = [
    ['README.md', 'README.ja.md'],
    ['CHANGELOG.md', 'CHANGELOG.ja.md'],
  ];
  for (const [english, japanese] of pairs) {
    assert.ok(read(english).includes(japanese), `${english} does not link to ${japanese}`);
    assert.ok(read(japanese).includes(english), `${japanese} does not link to ${english}`);
  }
});

test('both changelogs cover the same releases', () => {
  const versions = (text) => [...text.matchAll(/^## \[([^\]]+)\]/gm)].map((m) => m[1]);
  assert.deepEqual(versions(read('CHANGELOG.ja.md')), versions(read('CHANGELOG.md')));
});

test('the changelog has an entry for the current version', () => {
  const versions = [...read('CHANGELOG.md').matchAll(/^## \[([^\]]+)\]/gm)].map((m) => m[1]);
  assert.equal(versions[0], APP_VERSION, `the newest entry should be ${APP_VERSION}`);
});

test('the English README is written in English', () => {
  // A stray Japanese sentence here means a translation went into the wrong file.
  // Language names in the table are the one thing that belongs in its own script.
  const namesRow = /^\|.*(日本語|简体中文|繁體中文|한국어).*\|$/;
  const japanese = read('README.md')
    .split('\n')
    .filter((line) => /[぀-ヿ一-鿿]/.test(line)
      && !namesRow.test(line)
      && !line.includes('README.ja.md')
      && !line.includes('CHANGELOG.ja.md'));
  assert.deepEqual(japanese, []);
});
