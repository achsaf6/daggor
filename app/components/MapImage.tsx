import Image from "next/image";

interface MapImageProps {
  onLoad?: () => void;
}

export const MapImage = ({ onLoad }: MapImageProps) => {
  return (
    <Image
      src="/maps/city-assault-30-x-50-phased-v0-87llyi5jgauf1.png"
      alt="City Assault Map"
      fill
      className="object-contain pointer-events-none"
      style={{ opacity: 1 }}
      priority
      onLoad={onLoad}
      draggable={false}
    />
  );
};

