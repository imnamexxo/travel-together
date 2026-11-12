import {
  emptyForm, formFromExpense, itemsTotal, newItem, toggleDefaultSharer, toggleItemSharer, toInput, toKstParts, type ExpenseForm,
} from '@/features/expenses/expense-form';

import { expense } from './support/fakes';

const order = ['m1', 'm2', 'm3'];

function formWithTwoItems(): ExpenseForm {
  const form = emptyForm(order, 'm1');
  return { ...form, items: [{ ...form.items[0], name: '간식', amount: '12000' }, { ...newItem(order), name: '음료', amount: '9000' }] };
}

test('기본 분담 대상을 바꾸면 따르는 품목만 바뀌고 예외 품목은 그대로다', () => {
  let form = formWithTwoItems();
  form = toggleItemSharer(form, form.items[1].key, 'm1', order);
  form = toggleDefaultSharer(form, 'm3', order);

  expect(form.defaultSharerIds).toEqual(['m1', 'm2']);
  expect(form.items[0]).toMatchObject({ sharerIds: ['m1', 'm2'], followsDefault: true });
  expect(form.items[1]).toMatchObject({ sharerIds: ['m2', 'm3'], followsDefault: false });
});

test('예외 품목이 기본 분담 대상과 같아지면 다시 기본을 따른다', () => {
  let form = formWithTwoItems();
  form = toggleItemSharer(form, form.items[0].key, 'm2', order);
  expect(form.items[0].followsDefault).toBe(false);
  form = toggleItemSharer(form, form.items[0].key, 'm2', order);

  expect(form.items[0]).toMatchObject({ sharerIds: ['m1', 'm2', 'm3'], followsDefault: true });
});

test('분담 대상은 가입 순서로 정렬된다', () => {
  let form = emptyForm(order, 'm1');
  form = toggleDefaultSharer(form, 'm1', order);
  form = toggleDefaultSharer(form, 'm1', order);

  expect(form.defaultSharerIds).toEqual(['m1', 'm2', 'm3']);
});

test('불러온 지출에서 기본 분담 대상과 같은 품목은 기본을 따르는 것으로 본다', () => {
  const form = formFromExpense(expense({
    default_sharer_ids: ['m1', 'm2'],
    items: [
      { id: 'a', name: '간식', quantity: 2, amount: 12000, sharer_ids: ['m2', 'm1'] },
      { id: 'b', name: '케이블', quantity: null, amount: 9000, sharer_ids: ['m1'] },
    ],
  }));

  expect(form.items.map((item) => item.followsDefault)).toEqual([true, false]);
  expect(form.items[0].quantity).toBe('2');
  expect(form.items[1].quantity).toBe('');
});

test('결제 시각은 한국 시간으로 보내고, 한국 시간으로 보여준다', () => {
  const form = { ...formWithTwoItems(), date: '2026-11-12', time: '15:30', total: '21000' };

  expect(toInput(form).input.paid_at).toBe('2026-11-12T15:30:00+09:00');
  expect(toKstParts('2026-11-12T06:30:00Z')).toEqual({ date: '2026-11-12', time: '15:30' });
  expect(toKstParts('2026-11-12T16:10:00Z')).toEqual({ date: '2026-11-13', time: '01:10' });
});

test('비어 있는 값은 비운 채 보내고, 형식이 틀린 값만 막는다', () => {
  const blank = toInput(emptyForm(order, null));
  expect(blank.errors).toEqual({ 'items.0.name': '품목 이름을 입력해주세요.' });
  expect(blank.input).toMatchObject({ payer_member_id: null, paid_at: null, total_amount: null, merchant_name: null });

  const form = formWithTwoItems();
  const bad = toInput({ ...form, total: '3만', date: '11/12', time: '', items: [{ ...form.items[0], amount: '12,000', quantity: '0' }] });
  expect(Object.keys(bad.errors).sort()).toEqual(['date', 'items.0.amount', 'items.0.quantity', 'time', 'total_amount']);
});

test('품목 합계는 숫자로 읽을 수 있는 금액만 더한다', () => {
  const form = formWithTwoItems();

  expect(itemsTotal(form)).toBe(21000);
  expect(itemsTotal({ ...form, items: [{ ...form.items[0], amount: '' }, form.items[1]] })).toBe(9000);
});
