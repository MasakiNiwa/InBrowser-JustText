/**
 * テキスト → バイト列への変換（保存用）。
 *
 * TextEncoder は UTF-8 しか出力できないため、Shift_JIS などのレガシー
 * 文字コードは TextDecoder を総当たりして逆引き表をその場で組み立てる。
 * 表データを同梱せずに済み、ブラウザ内蔵の変換表とずれない。
 */

const tableCache = new Map();

/**
 * 1〜2 バイトで表現できる文字の「文字 → バイト列」表を作る。
 * 不正な並びは U+FFFD になるので、それを除外すれば有効な組だけが残る。
 */
function buildLegacyTable(encoding) {
  const cached = tableCache.get(encoding);
  if (cached) return cached;

  const decoder = new TextDecoder(encoding);
  const map = new Map();

  const one = new Uint8Array(1);
  for (let b = 0; b <= 0xff; b++) {
    one[0] = b;
    const s = decoder.decode(one);
    if (s.length === 1 && s !== '�' && !map.has(s)) map.set(s, Uint8Array.of(b));
  }

  const two = new Uint8Array(2);
  for (let hi = 0x81; hi <= 0xfe; hi++) {
    for (let lo = 0x40; lo <= 0xfe; lo++) {
      two[0] = hi;
      two[1] = lo;
      const s = decoder.decode(two);
      if (s.length === 1 && s !== '�' && !map.has(s)) map.set(s, Uint8Array.of(hi, lo));
    }
  }

  tableCache.set(encoding, map);
  return map;
}

function encodeUtf16(text, littleEndian, bom) {
  const out = new Uint8Array(text.length * 2 + (bom ? 2 : 0));
  let p = 0;
  if (bom) {
    out[p++] = littleEndian ? 0xff : 0xfe;
    out[p++] = littleEndian ? 0xfe : 0xff;
  }
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (littleEndian) {
      out[p++] = c & 0xff;
      out[p++] = c >> 8;
    } else {
      out[p++] = c >> 8;
      out[p++] = c & 0xff;
    }
  }
  return out;
}

function encodeUtf8(text, bom) {
  const body = new TextEncoder().encode(text);
  if (!bom) return body;
  const out = new Uint8Array(body.length + 3);
  out.set([0xef, 0xbb, 0xbf], 0);
  out.set(body, 3);
  return out;
}

function encodeLegacy(text, encoding) {
  const table = buildLegacyTable(encoding);
  const chunks = [];
  let size = 0;
  const unencodable = new Map();

  for (const ch of text) {
    const bytes = table.get(ch);
    if (bytes) {
      chunks.push(bytes);
      size += bytes.length;
    } else {
      // 変換できない文字は '?' に落として、UI 側で警告できるよう記録する。
      chunks.push(QUESTION);
      size += 1;
      unencodable.set(ch, (unencodable.get(ch) ?? 0) + 1);
    }
  }

  const out = new Uint8Array(size);
  let p = 0;
  for (const c of chunks) {
    out.set(c, p);
    p += c.length;
  }
  return { bytes: out, unencodable };
}

const QUESTION = Uint8Array.of(0x3f);

/** その文字コードで書き出せるか。 */
export function canEncode(encoding) {
  return encoding !== 'iso-2022-jp';
}

/**
 * テキストをバイト列にする。
 * 戻り値の unencodable は「変換できず '?' になった文字 → 個数」。
 */
export function encodeText(text, encoding = 'utf-8', { bom = false } = {}) {
  switch (encoding) {
    case 'utf-8':
      return { bytes: encodeUtf8(text, bom), unencodable: new Map() };
    case 'utf-16le':
      return { bytes: encodeUtf16(text, true, bom), unencodable: new Map() };
    case 'utf-16be':
      return { bytes: encodeUtf16(text, false, bom), unencodable: new Map() };
    case 'iso-2022-jp':
      throw new Error('ISO-2022-JP での保存には対応していません');
    default:
      return encodeLegacy(text, encoding);
  }
}
