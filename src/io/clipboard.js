/**
 * Copying to the clipboard.
 *
 * navigator.clipboard only exists in a secure context (https or localhost), so
 * where it is missing this falls back to the old select-and-copy trick.
 */

/** @returns {Promise<boolean>} whether the text was copied */
export async function copyText(text) {
  if (!text) return false;

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Permission can be refused; fall through to the older way.
    }
  }

  const scratch = document.createElement('textarea');
  scratch.value = text;
  scratch.setAttribute('readonly', '');
  scratch.style.position = 'fixed';
  scratch.style.top = '-1000px';
  scratch.style.opacity = '0';
  document.body.append(scratch);
  try {
    scratch.select();
    scratch.setSelectionRange(0, text.length);
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    scratch.remove();
  }
}
