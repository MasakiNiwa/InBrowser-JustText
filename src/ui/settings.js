/**
 * Display settings, kept in localStorage.
 * Where storage is unavailable — private browsing and the like — the defaults
 * are used and everything still works.
 */

const KEY = 'justtext.settings.v1';

export const DEFAULTS = {
  language: null, // null means: work it out from the device's language
  theme: 'auto', // auto | light | dark
  fontSize: 16, // iOS zooms in on any input below 16px, so never default under it
  wrap: true,
  gutter: true,
  keybar: true, // soft keyboards have no Tab key, so this is on by default
  tabSize: 2,
  insertSpaces: true,
  autoIndent: true,
  autosave: true, // keep a copy of unsaved work on the device
  draftKeepDays: 30, // how long an unclaimed copy is kept
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
    /* Failing to save changes nothing about how the app runs. */
  }
}
