/** Short messages along the bottom of the screen. */

const INFO_MS = 2600;
const ERROR_MS = 5000;
const ACTION_MS = 12000;

export function createToast(container) {
  let timer = 0;

  /**
   * @param {string} message
   * @param {'info'|'error'} [type]
   * @param {{label:string, onClick:() => void}} [action] optional button to offer
   */
  return function notify(message, type = 'info', action = null) {
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');

    const text = document.createElement('span');
    text.className = 'toast-text';
    text.textContent = message;
    el.append(text);

    if (action) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'toast-action';
      button.textContent = action.label;
      button.addEventListener('click', action.onClick);
      el.append(button);
    }

    container.replaceChildren(el);
    clearTimeout(timer);
    // One that offers an action stays longer, so it cannot vanish before it is pressed.
    const life = action ? ACTION_MS : type === 'error' ? ERROR_MS : INFO_MS;
    timer = setTimeout(() => {
      el.classList.add('leaving');
      setTimeout(() => el.remove(), 250);
    }, life);
  };
}
