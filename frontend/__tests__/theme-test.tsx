import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Text, TextInput, View } from 'react-native';
import { useState } from 'react';
import * as Native from 'react-native';
import { DarkTravelColors, TravelColors } from '@/constants/theme';
import { resolveTheme, THEME_STORAGE_KEY, TravelThemeProvider, useTravelTheme } from '@/theme/theme-context';
import { fakeApi, FakeAuthService } from './support/fakes';
import { renderApp } from './support/render-app';


function Sample() {
  const { mode, scheme, colors, ready, setMode } = useTravelTheme();
  const [draft, setDraft] = useState('');
  return <View><Text>{ready ? `${mode}:${scheme}` : 'loading'}</Text><Text testID="color">{colors.background}</Text>
    <TextInput accessibilityLabel="작성 중인 내용" value={draft} onChangeText={setDraft} />
    <Text onPress={() => void setMode('dark')}>다크 선택</Text>
    <Text onPress={() => void setMode('system')}>자동 선택</Text>
  </View>;
}

beforeEach(async () => { await AsyncStorage.clear(); jest.restoreAllMocks(); });

test('시스템 모드는 기기 설정을 따르고 수동 선택은 우선한다', () => {
  expect(resolveTheme('system', 'dark')).toBe('dark');
  expect(resolveTheme('system', null)).toBe('light');
  expect(resolveTheme('light', 'dark')).toBe('light');
  expect(resolveTheme('dark', 'light')).toBe('dark');
});

test('테마 변경으로 입력을 잃지 않고 재실행하면 저장된 모드가 복원된다', async () => {
  jest.spyOn(Native, 'useColorScheme').mockReturnValue('light');
  const app = render(<TravelThemeProvider><Sample /></TravelThemeProvider>);
  await screen.findByText('system:light');
  fireEvent.changeText(screen.getByLabelText('작성 중인 내용'), '내 여행 메모');
  fireEvent.press(screen.getByText('다크 선택'));
  await screen.findByText('dark:dark');
  expect(screen.getByLabelText('작성 중인 내용').props.value).toBe('내 여행 메모');
  expect(screen.getByTestId('color').props.children).toBe(DarkTravelColors.background);
  expect(await AsyncStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  app.unmount();
  render(<TravelThemeProvider><Sample /></TravelThemeProvider>);
  await screen.findByText('dark:dark');
});

test('시스템 모드에서 기기 모드가 바뀌면 화면에 반영한다', async () => {
  const system = jest.spyOn(Native, 'useColorScheme').mockReturnValue('light');
  const app = render(<TravelThemeProvider><Sample /></TravelThemeProvider>);
  await screen.findByText('system:light');
  system.mockReturnValue('dark');
  app.rerender(<TravelThemeProvider><Sample /></TravelThemeProvider>);
  await screen.findByText('system:dark');
});

test('알 수 없는 저장값은 시스템 기본값을 사용한다', async () => {
  jest.spyOn(Native, 'useColorScheme').mockReturnValue('light');
  await AsyncStorage.setItem(THEME_STORAGE_KEY, 'invalid');
  render(<TravelThemeProvider><Sample /></TravelThemeProvider>);
  await screen.findByText('system:light');
  expect(screen.getByTestId('color').props.children).toBe(TravelColors.background);
});

test('계정 관리에서 다크 모드를 선택하고 선택 상태를 확인한다', async () => {
  const auth = new FakeAuthService();
  auth.signInAs('minji@example.com');
  renderApp({ auth, api: fakeApi(), initialUrl: '/account' });
  const option = await screen.findByRole('radio', { name: /다크 모드/ });
  fireEvent.press(option);
  await waitFor(() => expect(screen.getByRole('radio', { name: /다크 모드/ }).props.accessibilityState.checked).toBe(true));
  expect(await AsyncStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  expect(screen.getByText('계정 관리').props.style.color).toBe(DarkTravelColors.primary);
  fireEvent.press(screen.getByRole('radio', { name: /라이트 모드/ }));
  await waitFor(() => expect(screen.getByText('계정 관리').props.style.color).toBe(TravelColors.primary));
});


test('저장 실패는 안내하고 이전 선택을 유지한다', async () => {
  const auth = new FakeAuthService();
  auth.signInAs('minji@example.com');
  renderApp({ auth, api: fakeApi(), initialUrl: '/account' });
  await screen.findByRole('radio', { name: /다크 모드/ });
  jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('storage unavailable'));
  fireEvent.press(screen.getByRole('radio', { name: /다크 모드/ }));
  expect(await screen.findByText('설정을 저장하지 못했어요. 다시 선택해주세요.')).toBeTruthy();
  expect(screen.getByRole('radio', { name: /다크 모드/ }).props.accessibilityState.checked).toBe(false);
});
