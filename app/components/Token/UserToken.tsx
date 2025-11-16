import { ReactNode } from "react";
import { Position, ImageBounds } from "../../types";
import { Token } from "./Token";

interface UserTokenProps {
  position: Position;
  color: string;
  imageSrc?: string | null;
  imageBounds: ImageBounds | null;
  worldMapWidth?: number;
  worldMapHeight?: number;
  isInteractive?: boolean;
  onMouseDown?: (e: React.MouseEvent) => void;
  onTouchStart?: (e: React.TouchEvent) => void;
  onClick?: (e: React.MouseEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  gridData?: {
    verticalLines: number[];
    horizontalLines: number[];
    imageWidth: number;
    imageHeight: number;
  };
  gridScale?: number;
  zIndex?: number;
  isMounted?: boolean;
  opacity?: number;
  title?: string;
  children?: ReactNode;
}

export const UserToken = ({
  position,
  color,
  imageSrc,
  imageBounds,
  worldMapWidth = 0,
  worldMapHeight = 0,
  isInteractive = false,
  onMouseDown,
  onTouchStart,
  onClick,
  onContextMenu,
  gridData,
  gridScale = 1.0,
  zIndex,
  isMounted,
  opacity,
  title,
  children,
}: UserTokenProps) => {
  return (
    <Token
      position={position}
      color={color}
      imageSrc={imageSrc}
      imageBounds={imageBounds}
      worldMapWidth={worldMapWidth}
      worldMapHeight={worldMapHeight}
      isInteractive={isInteractive}
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
      onClick={onClick}
      onContextMenu={onContextMenu}
      gridData={gridData}
      gridScale={gridScale}
      zIndex={zIndex}
      isMounted={isMounted}
      opacity={opacity}
      title={title}
    >
      {children}
    </Token>
  );
};

