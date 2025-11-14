import Image from "next/image";
import { DEFAULT_BATTLEMAP_MAP_PATH } from "../../lib/defaultBattlemap";

interface MapImageProps {
  onLoad?: () => void;
  scale?: number;
  translateX?: number;
  translateY?: number;
  src?: string | null;
}

export const MapImage = ({
  onLoad,
  scale = 1,
  translateX = 0,
  translateY = 0,
  src,
}: MapImageProps) => {
  const transform =
    scale !== 1 || translateX !== 0 || translateY !== 0
      ? `scale(${scale}) translate(${translateX}px, ${translateY}px)`
      : undefined;

  const resolvedSrc =
    typeof src === "string" && src.trim().length > 0 ? src : DEFAULT_BATTLEMAP_MAP_PATH;

  return (
    <Image
      src={resolvedSrc}
      alt="Battlemap"
      fill
      unoptimized
      className="object-contain pointer-events-none"
      style={{
        opacity: 1,
        transform,
        transformOrigin: "center center",
      }}
      priority
      onLoad={onLoad}
      draggable={false}
    />
  );
};

