/**
 * クリップボードへのコピー。
 *
 * navigator.clipboard は安全な文脈（https / localhost）でしか使えないため、
 * 使えないときは選択してコピーする昔ながらの方法に落とす。
 */

/** @returns {Promise<boolean>} コピーできたか */
export async function copyText(text) {
  if (!text) return false;

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // 許可が下りない場合があるので、下の方法を試す
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
