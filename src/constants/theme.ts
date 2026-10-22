import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#0E1512',
    textSecondary: '#5E6B66',
    background: '#F2F5F3',
    card: '#FFFFFF',
    backgroundElement: '#E7EDEA',
    backgroundSelected: '#D5EADF',
    border: '#E0E7E3',
    tint: '#0F8A55',
    tintSoft: '#E1F3EA',
    onTint: '#FFFFFF',
    danger: '#D93C3C',
    warning: '#C27C0E',
    shadow: '#0B2A1C',
  },
  dark: {
    text: '#EEF2F0',
    textSecondary: '#9AA8A2',
    background: '#0B0F0D',
    card: '#151B18',
    backgroundElement: '#1F2723',
    backgroundSelected: '#1F3A2D',
    border: '#27312C',
    tint: '#3DD68C',
    tintSoft: '#16301F',
    onTint: '#06130C',
    danger: '#FF7A7A',
    warning: '#F2B84B',
    shadow: '#000000',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: { sans: 'system-ui', rounded: 'ui-rounded', mono: 'ui-monospace' },
  default: { sans: 'normal', rounded: 'normal', mono: 'monospace' },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = { small: 10, medium: 14, large: 22, pill: 999 } as const;
