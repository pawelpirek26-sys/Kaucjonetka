// User-chosen colour theme (system / light / dark), applied app-wide through Appearance.
import { Storage } from 'expo-sqlite/kv-store';
import { Appearance } from 'react-native';

export type ThemePreference = 'system' | 'light' | 'dark';

const KEY = 'theme';

export const THEME_LABELS: Record<ThemePreference, string> = { system: 'Systemowy', light: 'Jasny', dark: 'Ciemny' };

export function getThemePreference(): ThemePreference {
  try {
    const value = Storage.getItemSync(KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

export function applyThemePreference(pref: ThemePreference = getThemePreference()): void {
  Appearance.setColorScheme(pref === 'system' ? 'unspecified' : pref);
}

export function setThemePreference(pref: ThemePreference): void {
  try {
    Storage.setItemSync(KEY, pref);
  } catch (e) {
    console.warn('[theme]', e);
  }
  applyThemePreference(pref);
}
