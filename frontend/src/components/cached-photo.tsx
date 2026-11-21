import { Image, type ImageContentFit } from 'expo-image';
import type { StyleProp, ImageStyle } from 'react-native';

type Props = {
  uri: string;
  /**
   * 기기 디스크 캐시의 이름표. 사진 링크(서명 URL)는 목록을 받을 때마다 바뀌어서 링크로 캐시하면 매번 다시 받는다.
   * 사진 id로 캐시해서 한 번 받은 사진은 다시 받지 않게 한다(저장소 전송량 절약).
   */
  cacheKey: string;
  style?: StyleProp<ImageStyle>;
  contentFit?: ImageContentFit;
  accessibilityLabel?: string;
  onError?: () => void;
};

/** 앨범·지도 사진. 원본과 썸네일은 cacheKey를 다르게 준다(예: `${id}` / `${id}-thumb`). */
export default function CachedPhoto({ uri, cacheKey, style, contentFit = 'cover', accessibilityLabel, onError }: Props) {
  return <Image source={{ uri, cacheKey }} cachePolicy="disk" style={style} contentFit={contentFit} accessibilityLabel={accessibilityLabel} onError={onError} transition={120} />;
}
