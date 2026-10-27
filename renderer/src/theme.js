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

export function applyVisualPreferences(layout, root, prefersDark = false) {
  const theme = applyTheme(layout.theme, root, prefersDark);
  if (root) {
    root.dataset.accent = layout.accent;
    root.dataset.animations = layout.animations ? 'on' : 'off';
    root.style.setProperty?.('--table-font-size', `${layout.tableFontSize}px`);
    root.style.setProperty?.('--radius-sm', `${Math.max(0, layout.radius - 4)}px`);
    root.style.setProperty?.('--radius-md', `${layout.radius}px`);
    root.style.setProperty?.('--radius-lg', `${layout.radius === 0 ? 0 : Math.min(28, layout.radius + 2)}px`);
  }
  return theme;
}

export function installThemeSync({ window: browserWindow = globalThis.window, document: browserDocument = globalThis.document,
  storage = browserWindow?.localStorage } = {}) {
  const media = browserWindow?.matchMedia?.('(prefers-color-scheme: dark)');
  const sync = () => applyVisualPreferences(readLayoutPreferences(storage), browserDocument?.documentElement, media?.matches === true);
  sync();
  browserWindow?.addEventListener?.('vudoo:ui-preferences', sync);
  media?.addEventListener?.('change', sync);
  return () => {
    browserWindow?.removeEventListener?.('vudoo:ui-preferences', sync);
    media?.removeEventListener?.('change', sync);
  };
}
