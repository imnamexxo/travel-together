// 웹에는 앱 화면 없이 Play 등록용 공개 페이지만 올린다(개인정보 처리방침, 계정 삭제 안내).
// 사용: npm run legal:build && npx eas-cli deploy --prod --export-dir dist-legal
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const out = 'dist-legal';
rmSync(out, { recursive: true, force: true });
mkdirSync(out);
for (const page of ['privacy.html', 'delete-account.html']) cpSync(join('public', page), join(out, page));
writeFileSync(join(out, 'index.html'), `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Travel Together</title>
<style>body{margin:0;font:16px/1.7 -apple-system,"Apple SD Gothic Neo","Noto Sans KR",sans-serif;background:#f6f7fb;color:#1c2433}main{max-width:640px;margin:0 auto;padding:48px 16px}a{color:#223858}@media (prefers-color-scheme:dark){body{background:#10141c;color:#e8ebf2}a{color:#9db6e0}}</style></head>
<body><main><h1>Travel Together</h1><p>함께 떠나는 여행의 일정, 사진, 경비를 한곳에서. 안드로이드 앱으로 이용할 수 있어요.</p><ul><li><a href="/privacy">개인정보 처리방침</a></li><li><a href="/delete-account">계정 삭제 요청</a></li></ul><p>문의: <a href="mailto:traveltogether.apps@gmail.com">traveltogether.apps@gmail.com</a></p></main></body></html>
`);
console.log(`wrote ${out}/`);
