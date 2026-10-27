import { readLayoutPreferences } from './uiPreferences.js';

export function resolveTheme(preference, prefersDark = false) {
  return preference === 'dark' || (preference === 'system' && prefersDark) ? 'dark' : 'light';
}

export function applyTheme(preference, root, prefersDark = false) {
  const theme = resolveTheme(preference, prefersDark);
  if (root) {
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
  }
  return theme;
}

export function installThemeSync({ window: browserWindow = globalThis.window, document: browserDocument = globalThis.document,
  storage = browserWindow?.localStorage } = {}) {
  const media = browserWindow?.matchMedia?.('(prefers-color-scheme: dark)');
  const sync = () => applyTheme(readLayoutPreferences(storage).theme, browserDocument?.documentElement, media?.matches === true);
  sync();
  browserWindow?.addEventListener?.('vudoo:ui-preferences', sync);
  media?.addEventListener?.('change', sync);
  return () => {
    browserWindow?.removeEventListener?.('vudoo:ui-preferences', sync);
    media?.removeEventListener?.('change', sync);
  };
}
