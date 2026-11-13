"""여행 통화(ADR 0004). 금액은 통화의 가장 작은 단위 정수로 저장한다."""

from dataclasses import dataclass
from typing import Literal


@dataclass(frozen=True)
class Currency:
    symbol: str
    # 소수 자릿수. 0이면 저장값이 곧 금액(원·엔), 2면 1/100 단위(센트).
    decimals: int
    # True면 "12,000원"처럼 기호를 뒤에 붙인다.
    suffix: bool = False


CURRENCIES: dict[str, Currency] = {
    "KRW": Currency("원", 0, suffix=True),
    "JPY": Currency("¥", 0),
    "USD": Currency("$", 2),
    "EUR": Currency("€", 2),
    "CNY": Currency("CN¥", 2),
    "TWD": Currency("NT$", 0),
    "THB": Currency("฿", 2),
    "VND": Currency("₫", 0),
    "PHP": Currency("₱", 2),
    "HKD": Currency("HK$", 2),
    "SGD": Currency("S$", 2),
}

CurrencyCode = Literal["KRW", "JPY", "USD", "EUR", "CNY", "TWD", "THB", "VND", "PHP", "HKD", "SGD"]
DEFAULT_CURRENCY = "KRW"


def format_money(amount: int, code: str) -> str:
    c = CURRENCIES[code]
    whole = f"{amount / 10 ** c.decimals:,.{c.decimals}f}" if c.decimals else f"{amount:,}"
    return f"{whole}{c.symbol}" if c.suffix else f"{c.symbol}{whole}"
