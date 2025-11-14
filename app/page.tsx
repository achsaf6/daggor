import { MapView } from "./components/MapView";
import { BattlemapProvider } from "./providers/BattlemapProvider";

export default function Home() {
  return (
    <BattlemapProvider>
      <MapView />
    </BattlemapProvider>
  );
}
