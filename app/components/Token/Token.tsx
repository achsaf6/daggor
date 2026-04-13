import { ReactNode, useEffect, useState } from "react";
import { Position, ImageBounds, TokenSize } from "../../types";
import {
  getViewportPosition,
  getViewportSize,
  positionToImageRelative,
} from "../../utils/coordinates";
import { computeGridLines } from "../../utils/grid";
import { useCoordinateMapper } from "../../hooks/useCoordinateMapper";
import { getTokenSizeUnits } from "../../utils/tokenSizes";

interface TokenProps {
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
  size?: TokenSize;
}

export const Token = ({
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
  zIndex = 10,
  isMounted = true,
  opacity = 1.0,
  title,
  children,
  size,
}: TokenProps) => {
  const coordinateMapper = useCoordinateMapper(
    imageBounds,
    worldMapWidth,
    worldMapHeight
  );

  // Track the displayed image source separately to ensure seamless transitions
  const [displayedImageSrc, setDisplayedImageSrc] = useState<string | null | undefined>(imageSrc);

  // Preload new images before switching to them
  useEffect(() => {
    // If imageSrc hasn't changed, no need to do anything
    if (imageSrc === displayedImageSrc) {
      return;
    }

    // If imageSrc is being cleared (set to null), update immediately
    if (!imageSrc) {
      // Use setTimeout to avoid synchronous setState in effect
      setTimeout(() => {
        setDisplayedImageSrc(null);
      }, 0);
      return;
    }

    // If we're switching from one image to another, preload the new one
    const img = new Image();
    
    img.onload = () => {
      // Image loaded successfully, safe to switch
      setDisplayedImageSrc(imageSrc);
    };
    
    img.onerror = () => {
      // Image failed to load, still switch to show error state
      setDisplayedImageSrc(imageSrc);
    };
    
    img.src = imageSrc;
  }, [imageSrc, displayedImageSrc]);

  if (!imageBounds) return null;

  // Calculate grid square size
  const calculateGridSquareSize = (): number => {
    if (!gridData) {
      // Fallback to old system if no grid data
      return getViewportSize(5, imageBounds); // 5% default
    }

    // Convert to viewport percentage
    // Only use coordinate mapper after mount to prevent hydration mismatch
    if (isMounted && coordinateMapper.isReady && worldMapWidth > 0 && worldMapHeight > 0) {
      // getSizeScale() already returns min(scaleX, scaleY) = uniformScale,
      // so baseSpacing * getSizeScale() = the square cell side on screen.
      // Do NOT pass scaleX/scaleY to computeGridLines here — that would double-apply
      // the square factor (once in spacingX, once in getSizeScale).
      const { spacingX } = computeGridLines(gridData, gridScale);
      if (spacingX <= 0) return getViewportSize(5, imageBounds);
      const sizeInScreenPixels = spacingX * coordinateMapper.getSizeScale();
      return (sizeInScreenPixels / imageBounds.containerWidth) * 100;
    } else {
      // Fallback: apply square-grid adjustment explicitly.
      // spacingX_adj * scaleX = baseSpacing * uniformScale = square cell side.
      const scaleX = imageBounds.width / gridData.imageWidth;
      const scaleY = imageBounds.height / gridData.imageHeight;
      const { spacingX } = computeGridLines(gridData, gridScale, 0, 0, 0, 0, 0, 0, scaleX, scaleY);
      if (spacingX <= 0) return getViewportSize(5, imageBounds);
      return (spacingX * scaleX / imageBounds.containerWidth) * 100;
    }
  };

  // Use coordinate mapper if world map dimensions are available, otherwise fallback to old system
  // Only use coordinate mapper after mount to prevent hydration mismatch
  let viewportPos: Position;

  if (isMounted && coordinateMapper.isReady && worldMapWidth > 0 && worldMapHeight > 0) {
    // Convert image-relative position to screen position using coordinate mapper
    const imageRelative = positionToImageRelative(position);
    const screenPos = coordinateMapper.imageRelativeToScreen(imageRelative);
    
    if (screenPos) {
      // Convert screen position to viewport percentage
      viewportPos = {
        x: ((screenPos.x - imageBounds.containerLeft) / imageBounds.containerWidth) * 100,
        y: ((screenPos.y - imageBounds.containerTop) / imageBounds.containerHeight) * 100,
      };
    } else {
      // Fallback to old system
      viewportPos = getViewportPosition(position, imageBounds);
    }
  } else {
    // Fallback to old system when coordinate mapper is not ready or before mount
    viewportPos = getViewportPosition(position, imageBounds);
  }

  // Calculate token size based on grid square size and category multiplier
  const baseTokenSize = calculateGridSquareSize();
  const sizeMultiplier = getTokenSizeUnits(size);
  const tokenSize = baseTokenSize * sizeMultiplier;

  // Use Tailwind z-index classes to avoid hydration issues
  // Only apply custom z-index after mount to prevent hydration mismatch
  const zIndexClass = isMounted && zIndex === 20 ? "z-20" : "z-10";

  return (
    <div
      className={`absolute rounded-full border border-white md:border-2 shadow-lg ${zIndexClass} ${
        isInteractive ? "cursor-move" : ""
      }`}
      title={title}
      draggable={false}
      style={{
        left: `${viewportPos.x}%`,
        top: `${viewportPos.y}%`,
        width: `${tokenSize}%`,
        aspectRatio: "1 / 1",
        transform: "translate(-50%, -50%)",
        backgroundColor: displayedImageSrc ? undefined : color,
        backgroundImage: displayedImageSrc ? `url(${displayedImageSrc})` : undefined,
        backgroundSize: displayedImageSrc ? "cover" : undefined,
        backgroundPosition: displayedImageSrc ? "center" : undefined,
        backgroundRepeat: displayedImageSrc ? "no-repeat" : undefined,
        touchAction: isInteractive ? "none" : "auto",
        opacity: opacity,
        userSelect: "none",
        WebkitUserSelect: "none",
        MozUserSelect: "none",
        msUserSelect: "none",
      }}
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      {children}
    </div>
  );
};

