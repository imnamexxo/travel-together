/**
 * 지출 편집 화면의 상태와 규칙. 화면과 분리해 두어 규칙만 따로 확인할 수 있다.
 *
 * 품목의 분담 대상은 "기본 분담 대상을 따른다"와 "예외로 직접 골랐다" 둘 중 하나다.
 * 기본 분담 대상을 바꾸면 따르는 품목만 함께 바뀐다.
 */

import type { Expense, ExpenseInput, ExpenseStatus } from '@/api/client';
import { moneyFor, type Money } from '@/lib/money';

const WON = moneyFor('KRW');

export const STATUS_LABEL: Record<ExpenseStatus, string> = { draft: '초안', needs_review: '확인 필요', confirmed: '확정' };

export type FormItem = {
  key: string;
  name: string;
  quantity: string;
  amount: string;
  sharerIds: string[];
  followsDefault: boolean;
};

export type ExpenseForm = {
  merchant: string;
  /** KST 기준 YYYY-MM-DD */
  date: string;
  /** KST 기준 HH:MM */
  time: string;
  payerId: string | null;
  total: string;
  defaultSharerIds: string[];
  items: FormItem[];
  /** 장소 후보에서 고른 장소. 고르기 전에는 비어 있다(자동으로 붙이지 않음). */
  place: { kakao_place_id: string; name: string } | null;
};

let nextKey = 0;
const newKey = () => `item-${++nextKey}`;

function sameMembers(a: string[], b: string[]) {
  return a.length === b.length && a.every((id) => b.includes(id));
}

/** 멤버 순서(가입 순서)를 지키며 정렬한다. */
function inOrder(ids: string[], memberOrder: string[]) {
  return memberOrder.filter((id) => ids.includes(id));
}

export function newItem(defaultSharerIds: string[]): FormItem {
  return { key: newKey(), name: '', quantity: '', amount: '', sharerIds: defaultSharerIds, followsDefault: true };
}

/** 새 지출: 결제자는 나, 기본 분담 대상은 전원, 빈 품목 하나. */
export function emptyForm(memberIds: string[], payerId: string | null): ExpenseForm {
  return { merchant: '', date: '', time: '', payerId, total: '', defaultSharerIds: memberIds, items: [newItem(memberIds)], place: null };
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const pad = (n: number) => String(n).padStart(2, '0');

export function toKstParts(iso: string): { date: string; time: string } {
  const d = new Date(new Date(iso).getTime() + KST_OFFSET_MS);
  return {
    date: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
    time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`,
  };
}

export function formFromExpense(expense: Expense, money: Money = WON): ExpenseForm {
  const { date, time } = expense.paid_at ? toKstParts(expense.paid_at) : { date: '', time: '' };
  const numberText = (n: number | null) => (n === null ? '' : String(n));
  const moneyText = (n: number | null) => (n === null ? '' : money.toText(n));
  return {
    merchant: expense.merchant_name ?? '',
    date,
    time,
    payerId: expense.payer_member_id,
    total: moneyText(expense.total_amount),
    defaultSharerIds: expense.default_sharer_ids,
    place: expense.place ? { kakao_place_id: expense.place.kakao_place_id, name: expense.place.name } : null,
    items: expense.items.map((item) => ({
      key: newKey(),
      name: item.name,
      quantity: numberText(item.quantity),
      amount: moneyText(item.amount),
      sharerIds: item.sharer_ids,
      followsDefault: sameMembers(item.sharer_ids, expense.default_sharer_ids),
    })),
  };
}

export function toggleDefaultSharer(form: ExpenseForm, memberId: string, memberOrder: string[]): ExpenseForm {
  const current = form.defaultSharerIds;
  const defaultSharerIds = inOrder(current.includes(memberId) ? current.filter((id) => id !== memberId) : [...current, memberId], memberOrder);
  return {
    ...form,
    defaultSharerIds,
    items: form.items.map((item) => (item.followsDefault ? { ...item, sharerIds: defaultSharerIds } : item)),
  };
}

/** 품목에서 멤버를 켜고 끄면 그 품목은 예외가 된다. 결과가 기본 분담 대상과 같아지면 다시 따른다. */
export function toggleItemSharer(form: ExpenseForm, itemKey: string, memberId: string, memberOrder: string[]): ExpenseForm {
  return {
    ...form,
    items: form.items.map((item) => {
      if (item.key !== itemKey) return item;
      const sharerIds = inOrder(item.sharerIds.includes(memberId) ? item.sharerIds.filter((id) => id !== memberId) : [...item.sharerIds, memberId], memberOrder);
      return { ...item, sharerIds, followsDefault: sameMembers(sharerIds, form.defaultSharerIds) };
    }),
  };
}

/** 숫자로 읽을 수 있는 품목 금액의 합(여행 통화의 가장 작은 단위). */
export function itemsTotal(form: ExpenseForm, money: Money = WON): number {
  return form.items.reduce((sum, item) => sum + (money.parse(item.amount) ?? 0), 0);
}

export function totalAmount(form: ExpenseForm, money: Money = WON): number | null {
  return money.parse(form.total) ?? null;
}

export type FormErrors = Record<string, string>;

/**
 * 서버로 보낼 내용. 비어 있는 값은 그대로 비워 보낸다(확정할 때 서버가 검사).
 * 형식이 틀린 값만 여기서 막는다. 오류 키는 서버의 field와 같은 모양이다(items.0.amount 등).
 */
export function toInput(form: ExpenseForm, money: Money = WON): { input: ExpenseInput; errors: FormErrors } {
  const errors: FormErrors = {};
  const amount = (text: string, field: string) => {
    const value = money.parse(text);
    if (value === undefined) { errors[field] = money.hint; return null; }
    return value;
  };
  let paidAt: string | null = null;
  if (form.date.trim() || form.time.trim()) {
    const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(form.date.trim());
    const timeOk = /^([01]\d|2[0-3]):[0-5]\d$/.test(form.time.trim());
    if (!dateOk) errors.date = '결제 날짜를 골라 주세요.';
    if (!timeOk) errors.time = '결제 시각을 골라 주세요.';
    if (dateOk && timeOk) paidAt = `${form.date.trim()}T${form.time.trim()}:00+09:00`;
  }
  const items = form.items.map((item, index) => {
    if (!item.name.trim()) errors[`items.${index}.name`] = '품목 이름을 입력해주세요.';
    const quantity = item.quantity.trim();
    if (quantity && !/^[1-9]\d*$/.test(quantity)) errors[`items.${index}.quantity`] = '수량은 1 이상 숫자로 입력해주세요.';
    return {
      name: item.name.trim(),
      quantity: quantity && /^[1-9]\d*$/.test(quantity) ? Number(quantity) : null,
      amount: amount(item.amount, `items.${index}.amount`),
      sharer_ids: item.sharerIds,
    };
  });
  return {
    input: {
      payer_member_id: form.payerId,
      paid_at: paidAt,
      merchant_name: form.merchant.trim() || null,
      total_amount: amount(form.total, 'total_amount'),
      default_sharer_ids: form.defaultSharerIds,
      items,
      place: form.place,
    },
    errors,
  };
}
