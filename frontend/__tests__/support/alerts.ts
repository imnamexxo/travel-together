import { act, fireEvent, screen } from '@testing-library/react-native';
import { Alert, type AlertButton } from 'react-native';

/** 테스트에서는 Alert.alert가 창을 띄우지 않는다. 호출 내용을 가로채 확인한다. */
export function spyOnAlerts() {
  return jest.spyOn(Alert, 'alert').mockImplementation(() => {});
}

/** "•••" 여행 메뉴를 열고, 뜬 알림창의 제목·내용·버튼을 돌려준다. */
export async function openTripMenu() {
  const alert = spyOnAlerts();
  fireEvent.press(await screen.findByRole('button', { name: '여행 메뉴' }));
  const [title, message, buttons] = alert.mock.calls.at(-1)!;
  return { alert, title, message, buttons: buttons as AlertButton[] };
}

export async function pressAlertButton(buttons: AlertButton[], text: string) {
  await act(async () => buttons.find((button) => button.text === text)!.onPress!());
}
