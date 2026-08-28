/**
 * 文字コードの判別とデコード。
 *
 * DOM に依存しないので Node の単体テストからもそのまま読み込める。
 * デコードはブラウザ / Node 標準の TextDecoder に任せ、
 * ここでは「どの文字コードとして読むか」の判断だけを行う。
 */

/** アプリが扱う文字コード。encodable=false は読み込み専用。 */
export const ENCODINGS = [
  { name: 'utf-8', label: 'UTF-8', encodable: true },
  { name: 'utf-16le', label: 'UTF-16 LE', encodable: true },
  { name: 'utf-16be', label: 'UTF-16 BE', encodable: true },
  { name: 'shift_jis', label: 'Shift_JIS', encodable: true },
  { name: 'euc-jp', label: 'EUC-JP', encodable: true },
  { name: 'iso-2022-jp', label: 'ISO-2022-JP', encodable: false },
  { name: 'windows-1252', label: 'Windows-1252', encodable: true },
];

const BOMS = [
  { encoding: 'utf-8', bytes: [0xef, 0xbb, 0xbf] },
  { encoding: 'utf-16be', bytes: [0xfe, 0xff] },
  { encoding: 'utf-16le', bytes: [0xff, 0xfe] },
];

/** 先頭の BOM を調べる。無ければ null。 */
export function detectBom(bytes) {
  for (const bom of BOMS) {
    if (bytes.length < bom.bytes.length) continue;
    if (bom.bytes.every((b, i) => bytes[i] === b)) {
      return { encoding: bom.encoding, length: bom.bytes.length };
    }
  }
  return null;
}

/**
 * 指定の文字コードでデコードする。
 * BOM は TextDecoder が既定で取り除く（ignoreBOM=false）。
 */
export function decodeText(bytes, encoding) {
  return new TextDecoder(encoding).decode(bytes);
}

/** その文字コードとして構文的に妥当か（不正バイト列があれば false）。 */
export function isValidFor(bytes, encoding) {
  try {
    new TextDecoder(encoding, { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

/**
 * デコード結果の「日本語テキストらしさ」を採点する。
 * 文字化けすると制御文字やラテン拡張が大量に出るので、そこを減点する。
 */
export function scoreText(text) {
  const n = Math.min(text.length, 8192);
  if (n === 0) return 0;
  let score = 0;
  for (let i = 0; i < n; i++) {
    const c = text.charCodeAt(i);
    if (c === 0x09 || c === 0x0a || c === 0x0d) score += 1;
    else if (c < 0x20 || c === 0x7f) score -= 30; // 制御文字は化けの強い証拠
    else if (c <= 0x7e) score += 1; // ASCII 可読文字
    else if (c === 0xfffd) score -= 50; // 置換文字
    else if (c >= 0x3000 && c <= 0x30ff) score += 3; // 句読点・かな
    else if (c >= 0x4e00 && c <= 0x9fff) score += 3; // 漢字
    else if (c >= 0xff00 && c <= 0xffef) score += 2; // 全角英数・半角カナ
    else if (c >= 0x00a0 && c <= 0x024f) score -= 3; // ラテン拡張（化けやすい）
    else if (c >= 0x2000 && c <= 0x2bff) score -= 1; // 記号類
  }
  return score / n;
}

/** ISO-2022-JP のエスケープシーケンスを含むか。 */
function looksIso2022jp(bytes) {
  const n = Math.min(bytes.length, 8192);
  for (let i = 0; i + 2 < n; i++) {
    if (bytes[i] !== 0x1b) continue;
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    if (b1 === 0x24 && (b2 === 0x40 || b2 === 0x42 || b2 === 0x28)) return true; // ESC $ @ / $ B / $ (
    if (b1 === 0x28 && (b2 === 0x42 || b2 === 0x4a || b2 === 0x49)) return true; // ESC ( B / ( J / ( I
  }
  return false;
}

/** BOM 無し UTF-16 の推定。NUL バイトの偏りを見る。 */
function detectUtf16WithoutBom(bytes) {
  if (bytes.length < 2 || bytes.length % 2 !== 0) return null;
  const n = Math.min(bytes.length, 4096) & ~1;
  let even = 0;
  let odd = 0;
  for (let i = 0; i < n; i++) {
    if (bytes[i] !== 0x00) continue;
    if (i % 2 === 0) even++;
    else odd++;
  }
  const half = n / 2;
  if (even > half * 0.3 && odd < half * 0.05) return 'utf-16be';
  if (odd > half * 0.3 && even < half * 0.05) return 'utf-16le';
  return null;
}

/**
 * バイト列から文字コードを推定する。
 * 返り値の reason は判定根拠（UI での説明用）。
 */
export function detectEncoding(bytes) {
  const bom = detectBom(bytes);
  if (bom) return { encoding: bom.encoding, bom: true, reason: 'bom' };
  if (bytes.length === 0) return { encoding: 'utf-8', bom: false, reason: 'empty' };

  if (looksIso2022jp(bytes)) return { encoding: 'iso-2022-jp', bom: false, reason: 'escape-sequence' };

  const utf16 = detectUtf16WithoutBom(bytes);
  if (utf16) return { encoding: utf16, bom: false, reason: 'nul-pattern' };

  if (isValidFor(bytes, 'utf-8')) return { encoding: 'utf-8', bom: false, reason: 'valid-utf8' };

  // UTF-8 として壊れている＝レガシー漢字コードの可能性。妥当性 → 得点の順で選ぶ。
  const candidates = ['shift_jis', 'euc-jp', 'windows-1252'];
  const scored = candidates.map((name) => ({
    name,
    valid: isValidFor(bytes, name),
    score: scoreText(decodeText(bytes, name)),
  }));
  const valid = scored.filter((c) => c.valid);
  const pool = valid.length > 0 ? valid : scored;
  pool.sort((a, b) => b.score - a.score);
  return { encoding: pool[0].name, bom: false, reason: 'heuristic', candidates: scored };
}

/** 表示用のラベル。未知の名前はそのまま返す。 */
export function encodingLabel(name) {
  return ENCODINGS.find((e) => e.name === name)?.label ?? name;
}
