import { Position, ImageBounds } from "../types";
import { Token } from "./Token";

interface UserTokenProps {
  position: Position;
  color: string;
  imageBounds: ImageBounds | null;
  worldMapWidth?: number;
  worldMapHeight?: number;
  isInteractive?: boolean;
  onMouseDown?: (e: React.MouseEvent) => void;
  onTouchStart?: (e: React.TouchEvent) => void;
  gridData?: {
    verticalLines: number[];
    horizontalLines: number[];
    imageWidth: number;
    imageHeight: number;
  };
  gridScale?: number;
}

export const UserToken = ({
  position,
  color,
  imageBounds,
  worldMapWidth = 0,
  worldMapHeight = 0,
  isInteractive = false,
  onMouseDown,
  onTouchStart,
  gridData,
  gridScale = 1.0,
}: UserTokenProps) => {
  return (
    <Token
      position={position}
      color={color}
      imageBounds={imageBounds}
      worldMapWidth={worldMapWidth}
      worldMapHeight={worldMapHeight}
      isInteractive={isInteractive}
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
      gridData={gridData}
      gridScale={gridScale}
    />
  );
};

