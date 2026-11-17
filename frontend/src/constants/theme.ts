/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

/** Shared palette for the travel screens. Change these values to recolor the app. */
export const TravelColors = {
  background: '#FFFFFF',
  primary: '#1C304D',
  accent: '#326183',
  text: '#202C3E',
  textSecondary: '#5F6F83',
  textMuted: '#6E7E92',
  onPrimary: '#FFFFFF',
  surface: '#F1F5F7',
  banner: '#E8EEF5',
  border: '#DBE3ED',
  divider: '#E7ECF3',
  inactive: '#8D9AAF',
  waveBack: '#D7E2EF',
  waveFront: '#ADBED5',
  sun: '#D9C9B1',
  error: '#B1443F',
  ticketBackground: '#1C304D',
  ticketText: '#FFFFFF',
  ticketMuted: '#B4C1D2',
} as const;

export type TravelPalette = { [K in keyof typeof TravelColors]: string };
export const DarkTravelColors: TravelPalette = {
  background: '#101925', primary: '#AFCDF2', accent: '#94BFE7',
  text: '#EFF4FB', textSecondary: '#B4C2D3', textMuted: '#98AAC0',
  onPrimary: '#142339', surface: '#1B293B', banner: '#263A53',
  border: '#435570', divider: '#2E4057', inactive: '#8A9CB3',
  ticketBackground: '#1C304D', ticketText: '#FFFFFF', ticketMuted: '#B4C1D2',
  waveBack: '#263A53', waveFront: '#3D5878', sun: '#C8AE78', error: '#FF9E98',
};

export const Colors = {
  light: {
    text: '#000000',
    background: '#ffffff',
    backgroundElement: '#F0F0F3',
    backgroundSelected: '#E0E1E6',
    textSecondary: '#60646C',
  },
  dark: {
    text: '#ffffff',
    background: '#000000',
    backgroundElement: '#212225',
    backgroundSelected: '#2E3135',
    textSecondary: '#B0B4BA',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
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

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
