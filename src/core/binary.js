/**
 * バイナリファイルらしさの判定。
 *
 * 画像や実行ファイルをテキストとして開くと内容が壊れるため、
 * 読み込み前に注意を促すために使う。判定は控えめにしてあり、
 * 迷ったら「テキスト」と見なす（開けないより開ける方が実害が少ない）。
 */

/** 調べる範囲（先頭からのバイト数・文字数）。 */
const SAMPLE = 8192;

/** テキストに現れても不自然でない制御文字。 */
const ALLOWED_CONTROL = new Set([
  0x09, // タブ
  0x0a, // 改行
  0x0b, // 垂直タブ
  0x0c, // 改ページ
  0x0d, // 復帰
  0x1b, // エスケープ（ISO-2022-JP や端末ログで使われる）
]);

const CONTROL_RATIO = 0.02;
const REPLACEMENT_RATIO = 0.05;

/**
 * @param {Uint8Array} bytes 元のバイト列
 * @param {string} text デコード結果
 * @param {string} encoding デコードに使った文字コード
 * @returns {{binary: boolean, reason: 'nul'|'control'|'broken'|null}}
 */
export function looksBinary(bytes, text, encoding = 'utf-8') {
  const utf16 = encoding === 'utf-16le' || encoding === 'utf-16be';

  // UTF-16 では NUL バイトが普通に現れるので、デコード後の文字で見る
  if (utf16) {
    const limit = Math.min(text.length, SAMPLE);
    for (let i = 0; i < limit; i++) {
      if (text.charCodeAt(i) === 0) return { binary: true, reason: 'nul' };
    }
  } else {
    const limit = Math.min(bytes.length, SAMPLE);
    for (let i = 0; i < limit; i++) {
      if (bytes[i] === 0) return { binary: true, reason: 'nul' };
    }
  }

  const limit = Math.min(text.length, SAMPLE);
  if (limit === 0) return { binary: false, reason: null };

  let control = 0;
  let replacement = 0;
  for (let i = 0; i < limit; i++) {
    const c = text.charCodeAt(i);
    if (c === 0xfffd) replacement++;
    else if ((c < 0x20 && !ALLOWED_CONTROL.has(c)) || c === 0x7f) control++;
  }

  if (control / limit > CONTROL_RATIO) return { binary: true, reason: 'control' };
  if (replacement / limit > REPLACEMENT_RATIO) return { binary: true, reason: 'broken' };
  return { binary: false, reason: null };
}
