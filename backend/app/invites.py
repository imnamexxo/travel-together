"""초대 코드: 8자리, 헷갈리는 0/O/1/I는 쓰지 않는다. 전역에서 유일하다."""

import secrets

from sqlalchemy import exists, select
from sqlalchemy.orm import Session

from app.models import INVITE_CODE_LENGTH, Trip

ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def normalize_code(raw: str) -> str:
    """대소문자와 공백 차이는 무시한다. 0→O 같은 치환은 하지 않는다."""
    return "".join(raw.split()).upper()


def new_invite_code(session: Session) -> str:
    """아직 어느 여행도 쓰지 않는 코드. 겹칠 확률은 32^8분의 1이라 다시 뽑기만 한다."""
    while True:
        code = "".join(secrets.choice(ALPHABET) for _ in range(INVITE_CODE_LENGTH))
        if not session.scalar(select(exists().where(Trip.invite_code == code))):
            return code
