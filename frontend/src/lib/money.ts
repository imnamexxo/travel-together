/**
 * 여행 통화(ADR 0004). 서버는 금액을 통화의 가장 작은 단위 정수로 주고받는다
 * (원·엔은 그대로, 달러는 센트). 화면에서는 여기서만 변환한다. 목록은 서버 app/currency.py와 같다.
 */

type CurrencyInfo = { name: string; symbol: string; decimals: number; suffix?: boolean };

export const CURRENCIES = {
  KRW: { name: '원 (대한민국)', symbol: '원', decimals: 0, suffix: true },
  JPY: { name: '엔 (일본)', symbol: '¥', decimals: 0 },
  USD: { name: '달러 (미국)', symbol: '$', decimals: 2 },
  EUR: { name: '유로 (유럽)', symbol: '€', decimals: 2 },
  CNY: { name: '위안 (중국)', symbol: 'CN¥', decimals: 2 },
  TWD: { name: '대만 달러', symbol: 'NT$', decimals: 0 },
  THB: { name: '바트 (태국)', symbol: '฿', decimals: 2 },
  VND: { name: '동 (베트남)', symbol: '₫', decimals: 0 },
  PHP: { name: '페소 (필리핀)', symbol: '₱', decimals: 2 },
  HKD: { name: '홍콩 달러', symbol: 'HK$', decimals: 2 },
  SGD: { name: '싱가포르 달러', symbol: 'S$', decimals: 2 },
} satisfies Record<string, CurrencyInfo>;

export type CurrencyCode = keyof typeof CURRENCIES;
export const CURRENCY_CODES = Object.keys(CURRENCIES) as CurrencyCode[];
export const DEFAULT_CURRENCY: CurrencyCode = 'KRW';

export type Money = {
  code: CurrencyCode;
  /** 입력 칸 옆에 붙일 단위: "원", "$" */
  unit: string;
  decimals: number;
  /** 12000 → "12,000원", 4550 → "$45.50" */
  format: (amount: number) => string;
  /** 입력 칸에 넣을 글자: 4550 → "45.50", 12000 → "12000" */
  toText: (amount: number) => string;
  /** 입력 글자를 저장값으로. 비었으면 null, 형식이 틀리면 undefined. */
  parse: (text: string) => number | null | undefined;
  /** 형식이 틀렸을 때 보여 줄 안내: "원 단위 숫자로 입력해주세요." */
  hint: string;
};

function infoOf(code: string): CurrencyInfo {
  return (CURRENCIES as Record<string, CurrencyInfo>)[code] ?? CURRENCIES.KRW;
}

export function moneyFor(code: string): Money {
  const known = code in CURRENCIES ? (code as CurrencyCode) : DEFAULT_CURRENCY;
  const c = infoOf(known);
  const scale = 10 ** c.decimals;
  const pattern = c.decimals ? new RegExp(`^\\d+(\\.\\d{1,${c.decimals}})?$`) : /^\d+$/;
  return {
    code: known,
    unit: c.symbol,
    decimals: c.decimals,
    format: (amount) => {
      const whole = (amount / scale).toLocaleString('en-US', { minimumFractionDigits: c.decimals, maximumFractionDigits: c.decimals });
      return c.suffix ? `${whole}${c.symbol}` : `${c.symbol}${whole}`;
    },
    toText: (amount) => (c.decimals ? (amount / scale).toFixed(c.decimals) : String(amount)),
    parse: (text) => {
      const t = text.trim();
      if (!t) return null;
      if (!pattern.test(t)) return undefined;
      const [int, frac = ''] = t.split('.');
      return Number(int) * scale + Number(frac.padEnd(c.decimals, '0') || 0);
    },
    hint: c.decimals ? `숫자로 입력해주세요(소수점 ${c.decimals}자리까지).` : `${c.symbol} 단위 숫자로 입력해주세요.`,
  };
}

export function currencyName(code: string): string {
  return infoOf(code).name;
}
