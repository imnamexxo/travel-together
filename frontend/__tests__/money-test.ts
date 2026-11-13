import { moneyFor } from '@/lib/money';

test.each([
  ['KRW', 12000, '12,000원', '12000'],
  ['JPY', 12000, '¥12,000', '12000'],
  ['USD', 4550, '$45.50', '45.50'],
  ['EUR', 5, '€0.05', '0.05'],
])('%s %d → %s', (code, amount, shown, text) => {
  const m = moneyFor(code);
  expect(m.format(amount)).toBe(shown);
  expect(m.toText(amount)).toBe(text);
  expect(m.parse(text)).toBe(amount);
});

test('입력 글자 해석', () => {
  const usd = moneyFor('USD');
  expect(usd.parse('45.5')).toBe(4550);
  expect(usd.parse('1,200')).toBeUndefined();
  expect(usd.parse('')).toBeNull();
  expect(usd.parse('1.234')).toBeUndefined();
  expect(moneyFor('KRW').parse('12.5')).toBeUndefined();
  expect(moneyFor('XYZ').code).toBe('KRW');
});
