import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Modal } from 'react-native';

import { DialogHost, showAlert } from '@/components/dialog';

test('앱 확인창: 제목·내용·버튼을 보여 주고, 누른 버튼의 동작을 한 뒤 닫힌다', async () => {
  render(<DialogHost />);
  const onRecord = jest.fn();

  act(() => showAlert('송금 완료로 기록할까요?', '서준 → 강동헌 64,000원', [{ text: '취소', style: 'cancel' }, { text: '기록', onPress: onRecord }]));

  expect(screen.getByText('송금 완료로 기록할까요?')).toBeOnTheScreen();
  expect(screen.getByText('서준 → 강동헌 64,000원')).toBeOnTheScreen();
  fireEvent.press(screen.getByRole('button', { name: '기록' }));
  expect(onRecord).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('송금 완료로 기록할까요?')).toBeNull();
});

test('버튼이 없으면 확인 하나, 뒤로 가기를 하면 취소처럼 닫힌다', () => {
  render(<DialogHost />);
  const onCancel = jest.fn();

  act(() => showAlert('저장했어요'));
  fireEvent.press(screen.getByRole('button', { name: '확인' }));
  expect(screen.queryByText('저장했어요')).toBeNull();

  act(() => showAlert('영수증으로 추가', '영수증을 찍거나 앨범에서 골라 주세요.', [{ text: '취소', style: 'cancel', onPress: onCancel }, { text: '앨범에서 고르기' }, { text: '사진 찍기' }]));
  fireEvent(screen.UNSAFE_getByType(Modal), 'requestClose');
  expect(onCancel).toHaveBeenCalledTimes(1);
});
