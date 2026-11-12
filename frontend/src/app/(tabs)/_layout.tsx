import TravelTabs from '@/components/travel-tabs';
import { PreviewTripProvider } from '@/features/trip/preview-state';

export default function TabLayout() {
  return <PreviewTripProvider><TravelTabs /></PreviewTripProvider>;
}
