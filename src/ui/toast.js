/** 画面下部に短いメッセージを出す。 */

export function createToast(container) {
  let timer = 0;

  return function notify(message, type = 'info') {
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    el.textContent = message;
    container.replaceChildren(el);
    clearTimeout(timer);
    timer = setTimeout(() => {
      el.classList.add('leaving');
      setTimeout(() => el.remove(), 250);
    }, type === 'error' ? 5000 : 2600);
  };
}
