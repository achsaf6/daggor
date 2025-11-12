import { Position, ImageBounds } from "../types";
import {
  getViewportPosition,
  getViewportSize,
  positionToImageRelative,
} from "../utils/coordinates";
import { useCoordinateMapper } from "../hooks/useCoordinateMapper";

interface TokenProps {
  position: Position;
  color: string;
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
}

export const Token = ({
  position,
  color,
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
}: TokenProps) => {
  const coordinateMapper = useCoordinateMapper(
    imageBounds,
    worldMapWidth,
    worldMapHeight
  );

  if (!imageBounds) return null;

  // Calculate grid square size
  const calculateGridSquareSize = (): number => {
    if (!gridData) {
      // Fallback to old system if no grid data
      return getViewportSize(5, imageBounds); // 5% default
    }

    const { verticalLines, horizontalLines } = gridData;
    
    // Calculate average spacing from original lines (same logic as GridLines)
    const calculateAverageSpacing = (lines: number[]): number => {
      if (lines.length < 2) return 0;
      const sorted = [...lines].sort((a, b) => a - b);
      const intervals: number[] = [];
      for (let i = 1; i < sorted.length; i++) {
        intervals.push(sorted[i] - sorted[i - 1]);
      }
      return intervals.reduce((sum, val) => sum + val, 0) / intervals.length;
    };

    const avgVerticalSpacing = calculateAverageSpacing(verticalLines);
    const avgHorizontalSpacing = calculateAverageSpacing(horizontalLines);
    const avgSpacing = Math.max(avgVerticalSpacing, avgHorizontalSpacing) || avgVerticalSpacing || avgHorizontalSpacing;
    
    if (avgSpacing <= 0) {
      // Fallback if can't calculate spacing
      return getViewportSize(5, imageBounds);
    }

    // Calculate scaled spacing (grid square size in world pixels)
    const scaledSpacing = avgSpacing * gridScale;

    // Convert to viewport percentage
    // Only use coordinate mapper after mount to prevent hydration mismatch
    if (isMounted && coordinateMapper.isReady && worldMapWidth > 0 && worldMapHeight > 0) {
      // Use coordinate mapper for proper scaling
      const sizeScale = coordinateMapper.getSizeScale();
      const sizeInScreenPixels = scaledSpacing * sizeScale;
      return (sizeInScreenPixels / imageBounds.containerWidth) * 100;
    } else {
      // Fallback: convert directly using image bounds
      const scaleX = imageBounds.width / gridData.imageWidth;
      const sizeInScreenPixels = scaledSpacing * scaleX;
      return (sizeInScreenPixels / imageBounds.containerWidth) * 100;
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

  // Calculate token size based on grid square size
  const tokenSize = calculateGridSquareSize();

  // Use Tailwind z-index classes to avoid hydration issues
  // Only apply custom z-index after mount to prevent hydration mismatch
  const zIndexClass = isMounted && zIndex === 20 ? "z-20" : "z-10";

  return (
    <div
      className={`absolute rounded-full border-2 border-white shadow-lg ${zIndexClass} ${
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
        backgroundColor: color,
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
    />
  );
};

