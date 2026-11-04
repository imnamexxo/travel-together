"""서버의 OpenAPI 명세를 openapi.json으로 저장한다. 앱 타입 생성(openapi-typescript)의 입력이다.

    python -m app.export_openapi
"""

import json

from app.config import BACKEND_DIR
from app.main import app

if __name__ == "__main__":
    path = BACKEND_DIR / "openapi.json"
    path.write_text(
        json.dumps(app.openapi(), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"wrote {path}")
