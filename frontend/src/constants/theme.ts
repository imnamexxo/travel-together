/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

/**
 * 여행 화면의 색. 남색 잉크 + 종이 흰색 + 옅은 안개색 바탕, 강조는 탑승권의 노란 도장 하나뿐(D-day, 오늘).
 * 노란색은 글자색으로 쓰지 않는다(흰 바탕에서 읽기 어렵다). 노란 바탕 위 글자는 ticketInk.
 */
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
  /** 노란 도장(D-day 등) 바탕과 그 위 글자. 노란색은 글자색으로 쓰지 않는다. */
  ticket: '#F4C542',
  ticketInk: '#3A2E05',
} as const;

export type TravelPalette = { [K in keyof typeof TravelColors]: string };
export const DarkTravelColors: TravelPalette = {
  background: '#101925', primary: '#AFCDF2', accent: '#94BFE7',
  text: '#EFF4FB', textSecondary: '#B4C2D3', textMuted: '#98AAC0',
  onPrimary: '#142339', surface: '#1B293B', banner: '#263A53',
  border: '#435570', divider: '#2E4057', inactive: '#8A9CB3',
  ticketBackground: '#1C304D', ticketText: '#FFFFFF', ticketMuted: '#B4C1D2',
  ticket: '#F4C542', ticketInk: '#3A2E05',
  waveBack: '#263A53', waveFront: '#3D5878', sun: '#C8AE78', error: '#FF9E98',
};

/** 제목·숫자용 글꼴(IBM Plex Sans KR). 본문은 시스템 글꼴. 글꼴을 지정한 글자에는 fontWeight를 함께 쓰지 않는다. */
export const Type = {
  display: 'IBMPlexSansKR_700Bold',
  heading: 'IBMPlexSansKR_600SemiBold',
  medium: 'IBMPlexSansKR_500Medium',
  body: 'IBMPlexSansKR_400Regular',
} as const;

/** 모서리 둥글기 세 단계: 칩·입력 보조(sm), 카드·버튼(md), 시트·큰 카드(lg). */
export const Radius = { sm: 8, md: 14, lg: 22 } as const;

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
