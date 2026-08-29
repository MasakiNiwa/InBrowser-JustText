/**
 * Detecting and converting line endings.
 *
 * A textarea's value always uses LF, so the flow is: normalise to LF when the
 * file is read, and put the original line ending back when it is saved.
 */

export const NEWLINES = [
  { name: 'lf', short: 'LF', value: '\n' },
  { name: 'crlf', short: 'CRLF', value: '\r\n' },
  { name: 'cr', short: 'CR', value: '\r' },
];

/** The line ending used most often. Falls back to 'lf' when there are none. */
export function detectNewline(text) {
  let crlf = 0;
  let lf = 0;
  let cr = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '\r') {
      if (text[i + 1] === '\n') {
        crlf++;
        i++;
      } else {
        cr++;
      }
    } else if (c === '\n') {
      lf++;
    }
  }
  if (crlf === 0 && lf === 0 && cr === 0) return 'lf';
  if (crlf >= lf && crlf >= cr) return 'crlf';
  if (lf >= cr) return 'lf';
  return 'cr';
}

/** Turns every line ending into LF. */
export function normalizeToLf(text) {
  return text.replace(/\r\n?/g, '\n');
}

/** Converts LF text to the given line ending. */
export function applyNewline(text, name) {
  const nl = NEWLINES.find((n) => n.name === name)?.value ?? '\n';
  return nl === '\n' ? text : text.replace(/\n/g, nl);
}

/** The short name for tight spaces (LF / CRLF / CR). The same in every language. */
export function newlineShort(name) {
  return NEWLINES.find((n) => n.name === name)?.short ?? name;
}
