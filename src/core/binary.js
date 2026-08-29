/**
 * Telling binary files apart from text.
 *
 * Opening an image or an executable as text corrupts it, so a file is checked
 * before it is loaded and the reader is warned. The check errs on the side of
 * "this is text": failing to open something is worse than a missed warning.
 */

/** How much of the start of the file to look at. */
const SAMPLE = 8192;

/** Control characters that appear in ordinary text. */
const ALLOWED_CONTROL = new Set([
  0x09, // tab
  0x0a, // line feed
  0x0b, // vertical tab
  0x0c, // form feed
  0x0d, // carriage return
  0x1b, // escape, used by ISO-2022-JP and by coloured terminal logs
]);

const CONTROL_RATIO = 0.02;
const REPLACEMENT_RATIO = 0.05;

/**
 * @param {Uint8Array} bytes the raw file
 * @param {string} text the result of decoding it
 * @param {string} encoding the encoding used to decode
 * @returns {{binary: boolean, reason: 'nul'|'control'|'broken'|null}}
 */
export function looksBinary(bytes, text, encoding = 'utf-8') {
  const utf16 = encoding === 'utf-16le' || encoding === 'utf-16be';

  // NUL bytes are normal in UTF-16, so look at the decoded characters instead.
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
