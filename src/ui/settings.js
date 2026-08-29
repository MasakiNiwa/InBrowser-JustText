/**
 * 表示設定の保存（localStorage）。
 * 保存できない環境（プライベートモード等）でも既定値で動く。
 */

const KEY = 'justtext.settings.v1';

export const DEFAULTS = {
  language: null, // null なら端末の言語から推定する
  theme: 'auto', // auto | light | dark
  fontSize: 16, // iOS は 16px 未満の入力欄に触れると画面を拡大するので、既定は下回らせない
  wrap: true,
  gutter: true,
  tabSize: 2,
  insertSpaces: true,
  autoIndent: true,
};

export function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const saved = JSON.parse(raw);
    return { ...DEFAULTS, ...saved };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* 保存できなくても動作には影響しない */
  }
}
