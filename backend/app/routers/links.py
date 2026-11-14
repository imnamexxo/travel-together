"""앱을 여는 링크 페이지(로그인 없이 열린다).

메신저에서는 traveltogether:// 같은 앱 주소가 링크로 눌리지 않는다. 그래서 https 주소를 보내고,
이 페이지가 앱을 연다. Android 크롬 계열은 intent:// 주소로 바로 앱을 열고, 그 밖에는 버튼을 누른다.
"""

import html
import json
import re
from urllib.parse import quote

from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse

router = APIRouter(include_in_schema=False)

APP_SCHEME = "traveltogether"
ANDROID_PACKAGE = "com.kang1031.frontend"
CODE = re.compile(r"^[A-Za-z0-9]{4,32}$")


def _page(title: str, message: str, app_path: str | None, user_agent: str) -> str:
    """app_path: 앱 안의 경로와 쿼리(예: "join?code=ABCD2345"). None이면 잘못된 링크 안내만."""
    button = ""
    script = ""
    if app_path is not None:
        app_url = f"{APP_SCHEME}://{app_path}"
        android = "android" in user_agent.lower()
        href = (
            f"intent://{app_path}#Intent;scheme={APP_SCHEME};package={ANDROID_PACKAGE};end" if android else app_url
        )
        button = f'<a class="button" href="{html.escape(href)}">앱에서 열기</a>'
        # 페이지가 열리면 한 번 바로 앱을 열어 본다(막히면 버튼을 누르면 된다).
        # 코드는 영문·숫자만 받으므로 href에 따옴표나 꺾쇠가 들어갈 수 없다. 스크립트 안에서는 JSON 문자열로 넣는다.
        script = f"<script>setTimeout(function(){{location.href={json.dumps(href)};}},300);</script>"
    return f"""<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{html.escape(title)} · Travel Together</title>
<style>
body{{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Noto Sans KR",sans-serif;background:#f6f7fb;color:#1c2433}}
main{{max-width:420px;margin:0 auto;padding:56px 24px;text-align:center}}
.logo{{font-size:12px;letter-spacing:.2em;color:#6b7385}}
h1{{font-size:24px;margin:18px 0 10px;color:#223858}}
p{{font-size:15px;line-height:1.6;color:#4a5263}}
.button{{display:block;margin:28px 0 14px;padding:16px;border-radius:14px;background:#223858;color:#fff;text-decoration:none;font-weight:600;font-size:16px}}
small{{color:#8a91a1;font-size:12px;line-height:1.6}}
</style></head>
<body><main><div class="logo">TRAVEL TOGETHER</div><h1>{html.escape(title)}</h1><p>{html.escape(message)}</p>{button}
<small>앱이 열리지 않으면 Travel Together 앱을 설치한 뒤 이 링크를 다시 눌러 주세요.</small></main>{script}</body></html>"""


@router.get("/join/{code}", response_class=HTMLResponse)
def join_link(code: str, request: Request) -> HTMLResponse:
    """여행 초대 링크. 앱이 열리면 이 코드로 바로 참여한다(로그인 전이면 로그인 뒤 이어서)."""
    agent = request.headers.get("user-agent", "")
    if not CODE.match(code):
        return HTMLResponse(_page("잘못된 초대 링크", "링크가 잘렸거나 올바르지 않아요. 초대한 친구에게 다시 받아 주세요.", None, agent), status_code=404)
    return HTMLResponse(
        _page("여행에 초대받았어요", "버튼을 누르면 앱에서 바로 여행에 들어가요.", f"join?code={quote(code.upper())}", agent)
    )


@router.get("/friend/{code}", response_class=HTMLResponse)
def friend_link(code: str, request: Request) -> HTMLResponse:
    """친구 링크. 앱이 열리면 링크 주인과 바로 친구가 된다(로그인 전이면 로그인 뒤 이어서)."""
    agent = request.headers.get("user-agent", "")
    if not CODE.match(code):
        return HTMLResponse(_page("잘못된 친구 링크", "링크가 잘렸거나 올바르지 않아요. 친구에게 다시 받아 주세요.", None, agent), status_code=404)
    return HTMLResponse(
        _page("친구 신청이 왔어요", "버튼을 누르면 앱에서 바로 친구가 돼요.", f"friend?code={quote(code.upper())}", agent)
    )
