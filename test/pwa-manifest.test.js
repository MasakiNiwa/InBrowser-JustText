import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const manifest = JSON.parse(
  readFileSync(new URL('../manifest.webmanifest', import.meta.url), 'utf-8'),
);

const origin = 'https://masakiniwa.github.io';
const directory = '/InBrowser-JustText/';
const manifestURL = new URL(`${directory}manifest.webmanifest`, origin);

test('the explicit PWA id preserves the previously computed identity', () => {
  const startURL = new URL(manifest.start_url, manifestURL);
  const idURL = new URL(manifest.id, startURL);

  // With no id, browsers normally used the start URL as the app identity.
  // Keep this equality so existing installs are not renamed as new apps.
  assert.equal(startURL.href, `${origin}${directory}`);
  assert.equal(idURL.href, startURL.href);
});

test('the PWA scope stays inside JustText and excludes other GitHub Pages apps', () => {
  const scope = new URL(manifest.scope, manifestURL);
  assert.equal(scope.href, `${origin}${directory}`);
  for (const otherPath of ['/LLLM-Study/', '/InBrowser-JustText-other/', '/']) {
    assert.equal(new URL(otherPath, origin).href.startsWith(scope.href), false, otherPath);
  }
});
