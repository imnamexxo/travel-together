import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

const SITE = 'https://kang1031-frontend.expo.app';
const TITLE = 'Travel Together - 함께 짜는 여행 일정·사진·경비 정산';
const DESCRIPTION = '여행 멤버와 일정을 함께 짜고, 사진을 한 앨범에 모으고, 경비를 자동으로 정산하는 여행 앱. AI 일정 추천, 영수증 인식, 지도, 외화 여행까지 무료로 쓸 수 있어요.';

/**
 * 웹 버전의 모든 페이지가 쓰는 HTML 틀(정적 렌더링 때만 쓴다). 검색엔진·메신저 미리보기용 정보를 넣는다.
 * 앱 화면은 자바스크립트로 그려서, 자바스크립트를 실행하지 않는 검색엔진을 위해 noscript에 짧은 소개를 둔다.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="ko">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <meta name="description" content={DESCRIPTION} />
        <meta name="theme-color" content="#223858" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Travel Together" />
        <meta property="og:title" content={TITLE} />
        <meta property="og:description" content={DESCRIPTION} />
        <meta property="og:url" content={SITE} />
        <meta property="og:image" content={`${SITE}/og-image.png`} />
        <meta property="og:image:width" content="1024" />
        <meta property="og:image:height" content="500" />
        <meta property="og:locale" content="ko_KR" />
        <meta name="twitter:card" content="summary_large_image" />
        <ScrollViewStyleReset />
      </head>
      <body>
        <noscript>
          <h1>Travel Together</h1>
          <p>{DESCRIPTION}</p>
          <ul>
            <li>함께 짜는 일정: 날짜별 일정을 멤버가 함께 고치고, AI가 동선에 맞춰 추천해요.</li>
            <li>하나로 모이는 사진: 각자 찍은 사진을 날짜별·장소별로 모아 봐요.</li>
            <li>여행 지도: 계획한 곳과 들른 곳을 지도에서 봐요.</li>
            <li>경비 정산: 영수증을 찍으면 AI가 읽고, 누가 누구에게 보낼지 계산해요.</li>
          </ul>
          <p>이 페이지를 쓰려면 브라우저에서 자바스크립트를 켜 주세요. <a href="/privacy">개인정보 처리방침</a></p>
        </noscript>
        {children}
      </body>
    </html>
  );
}
