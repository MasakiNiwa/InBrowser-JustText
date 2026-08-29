import test from 'node:test';
import assert from 'node:assert/strict';

import { detectBom, detectEncoding, decodeText, isValidFor, scoreText } from '../src/core/encoding.js';
import { encodeText, canEncode } from '../src/core/encoder.js';

const utf8 = (s) => new TextEncoder().encode(s);
const bytes = (...b) => new Uint8Array(b);

test('spots a BOM', () => {
  assert.deepEqual(detectBom(bytes(0xef, 0xbb, 0xbf, 0x61)), { encoding: 'utf-8', length: 3 });
  assert.deepEqual(detectBom(bytes(0xff, 0xfe, 0x61, 0x00)), { encoding: 'utf-16le', length: 2 });
  assert.deepEqual(detectBom(bytes(0xfe, 0xff, 0x00, 0x61)), { encoding: 'utf-16be', length: 2 });
  assert.equal(detectBom(utf8('abc')), null);
});

test('a BOM outranks everything else', () => {
  const withBom = new Uint8Array([0xef, 0xbb, 0xbf, ...utf8('あ')]);
  const detected = detectEncoding(withBom);
  assert.equal(detected.encoding, 'utf-8');
  assert.equal(detected.bom, true);
  // Decoding drops the BOM.
  assert.equal(decodeText(withBom, 'utf-8'), 'あ');
});

test('recognises Japanese in UTF-8', () => {
  assert.equal(detectEncoding(utf8('こんにちは、世界')).encoding, 'utf-8');
});

test('pure ASCII counts as UTF-8', () => {
  assert.equal(detectEncoding(utf8('{"key": "value"}\n')).encoding, 'utf-8');
});

test('an empty file is UTF-8', () => {
  assert.equal(detectEncoding(bytes()).encoding, 'utf-8');
});

test('tells Shift_JIS and EUC-JP apart', () => {
  const source = 'これは日本語のテキストです。設定ファイルの中身。';
  for (const encoding of ['shift_jis', 'euc-jp']) {
    const encoded = encodeText(source, encoding).bytes;
    const detected = detectEncoding(encoded);
    assert.equal(detected.encoding, encoding, `should have been read as ${encoding}`);
    assert.equal(decodeText(encoded, detected.encoding), source);
  }
});

test('ISO-2022-JP is recognised by its escape sequences', () => {
  // "日本", wrapped in ESC $ B ... ESC ( B
  const iso = bytes(0x1b, 0x24, 0x42, 0x46, 0x7c, 0x4b, 0x5c, 0x1b, 0x28, 0x42);
  const detected = detectEncoding(iso);
  assert.equal(detected.encoding, 'iso-2022-jp');
  assert.equal(decodeText(iso, 'iso-2022-jp'), '日本');
});

test('UTF-16 without a BOM is found by where the NUL bytes fall', () => {
  const le = encodeText('Hello world, this is UTF-16.', 'utf-16le').bytes;
  assert.equal(detectEncoding(le).encoding, 'utf-16le');
  const be = encodeText('Hello world, this is UTF-16.', 'utf-16be').bytes;
  assert.equal(detectEncoding(be).encoding, 'utf-16be');
});

test('checks whether bytes are valid for an encoding', () => {
  assert.equal(isValidFor(utf8('あ'), 'utf-8'), true);
  assert.equal(isValidFor(bytes(0xff, 0xfe, 0x00), 'utf-8'), false);
});

test('garbled text scores lower than clean text', () => {
  const clean = scoreText('日本語のテキストです');
  const garbled = scoreText(decodeText(encodeText('日本語のテキストです', 'shift_jis').bytes, 'euc-jp'));
  assert.ok(clean > garbled, `${clean} > ${garbled}`);
});

test('every encoding survives a round trip', () => {
  const source = 'あいうえお ABC 123 漢字\nタブ\tあり';
  for (const encoding of ['utf-8', 'utf-16le', 'utf-16be', 'shift_jis', 'euc-jp']) {
    const { bytes: encoded, unencodable } = encodeText(source, encoding);
    assert.equal(unencodable.size, 0, `${encoding}: nothing here should be unencodable`);
    assert.equal(decodeText(encoded, encoding), source, `round trip through ${encoding}`);
  }
});

test('writes a BOM when asked', () => {
  const { bytes: encoded } = encodeText('あ', 'utf-8', { bom: true });
  assert.deepEqual([...encoded.slice(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.equal(decodeText(encoded, 'utf-8'), 'あ');
});

test('a character the encoding cannot hold becomes ? and is reported', () => {
  const { bytes: encoded, unencodable } = encodeText('abc漢', 'windows-1252');
  assert.equal(decodeText(encoded, 'windows-1252'), 'abc?');
  assert.equal(unencodable.get('漢'), 1);
});

test('ISO-2022-JP cannot be written', () => {
  assert.equal(canEncode('iso-2022-jp'), false);
  assert.throws(() => encodeText('あ', 'iso-2022-jp'), /ISO-2022-JP/);
});
