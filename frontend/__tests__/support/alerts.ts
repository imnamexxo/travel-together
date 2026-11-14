import { act, fireEvent, screen } from '@testing-library/react-native';
import { Alert, type AlertButton } from 'react-native';

/** 테스트에서는 Alert.alert가 창을 띄우지 않는다. 호출 내용을 가로채 확인한다. */
export function spyOnAlerts() {
  return jest.spyOn(Alert, 'alert').mockImplementation(() => {});
}

/** "•••" 여행 메뉴(아래에서 올라오는 메뉴)를 열고, 안내 문구와 항목을 누르는 함수를 돌려준다. */
export async function openTripMenu() {
  const alert = spyOnAlerts();
  fireEvent.press(await screen.findByRole('button', { name: '여행 메뉴' }));
  const info = await screen.findByTestId('action-sheet-info');
  const message = String(info.props.children);
  const choose = async (label: string) => {
    fireEvent.press(screen.getByRole('button', { name: label }));
    await act(async () => {});
  };
  return { alert, message, choose };
}

export async function pressAlertButton(buttons: AlertButton[], text: string) {
  await act(async () => buttons.find((button) => button.text === text)!.onPress!());
}
