import type { PlaceMapProps } from './map-types';
import PlaceList from './place-list';

// Keep native map imports out of the web bundle. Web is not a target platform.
export default function PlaceMap(props: PlaceMapProps) {
  return <PlaceList {...props} hint="실제 지도는 아이폰·안드로이드 앱에서 확인할 수 있어요." />;
}
