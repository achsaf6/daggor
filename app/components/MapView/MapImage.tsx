import Image from "next/image";
import { memo, useMemo } from "react";
import { DEFAULT_BATTLEMAP_MAP_PATH } from "../../../lib/defaultBattlemap";

interface MapImageProps {
  onLoad?: () => void;
  scale?: number;
  translateX?: number;
  translateY?: number;
  src?: string | null;
}

const IDENTITY_STYLE: React.CSSProperties = {
  opacity: 1,
  transformOrigin: "center center",
};

const MapImageInner = ({
  onLoad,
  scale = 1,
  translateX = 0,
  translateY = 0,
  src,
}: MapImageProps) => {
  const isIdentity = scale === 1 && translateX === 0 && translateY === 0;

  const style = useMemo<React.CSSProperties>(() => {
    if (isIdentity) {
      return IDENTITY_STYLE;
    }
    return {
      opacity: 1,
      transform: `scale(${scale}) translate(${translateX}px, ${translateY}px)`,
      transformOrigin: "center center",
    };
  }, [isIdentity, scale, translateX, translateY]);

  const resolvedSrc =
    typeof src === "string" && src.trim().length > 0 ? src : DEFAULT_BATTLEMAP_MAP_PATH;

  return (
    <Image
      src={resolvedSrc}
      alt="Battlemap"
      fill
      unoptimized
      className="object-contain pointer-events-none"
      style={style}
      priority
      onLoad={onLoad}
      draggable={false}
    />
  );
};

export const MapImage = memo(MapImageInner);
MapImage.displayName = "MapImage";

