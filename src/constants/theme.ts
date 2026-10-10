import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#11181C',
    textSecondary: '#5F6B73',
    background: '#F5F7F6',
    card: '#FFFFFF',
    backgroundElement: '#ECEFEE',
    backgroundSelected: '#DDE3E0',
    border: '#D9DFDC',
    tint: '#1F7A4D',
    onTint: '#FFFFFF',
    danger: '#C23B3B',
    warning: '#B7791F',
  },
  dark: {
    text: '#ECEDEE',
    textSecondary: '#A3ADB3',
    background: '#0F1412',
    card: '#1A201D',
    backgroundElement: '#232A27',
    backgroundSelected: '#2E3733',
    border: '#2F3833',
    tint: '#4CC38A',
    onTint: '#08130D',
    danger: '#F07171',
    warning: '#E8B04B',
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

export const Radius = { small: 8, medium: 12, large: 20, pill: 999 } as const;
