import { MapView } from "./components/MapView/MapView";
import { BattlemapProvider } from "./providers/BattlemapProvider";
import { CharacterProvider } from "./providers/CharacterProvider";

export default function Home() {
  return (
    <BattlemapProvider>
      <CharacterProvider>
        <MapView />
      </CharacterProvider>
    </BattlemapProvider>
  );
}
