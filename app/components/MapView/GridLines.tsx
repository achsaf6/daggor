import { ImageBounds } from '../../types';
import { useCoordinateMapper } from '../../hooks/useCoordinateMapper';

interface GridLinesProps {
  gridData: {
    verticalLines: number[];
    horizontalLines: number[];
    imageWidth: number;
    imageHeight: number;
  };
  imageBounds: ImageBounds | null;
  gridScale?: number; // Scale factor for grid size (1.0 = original, >1.0 = larger cells, <1.0 = smaller cells)
  gridOffsetX?: number; // Horizontal offset in pixels
  gridOffsetY?: number; // Vertical offset in pixels
}

export const GridLines = ({
  gridData,
  imageBounds,
  gridScale = 1.0,
  gridOffsetX = 0,
  gridOffsetY = 0,
}: GridLinesProps) => {
  const coordinateMapper = useCoordinateMapper(
    imageBounds,
    gridData?.imageWidth || 0,
    gridData?.imageHeight || 0
  );

  if (!imageBounds || !gridData) return null;

  const { verticalLines, horizontalLines, imageWidth, imageHeight } = gridData;

  // Calculate average spacing from original lines
  const calculateAverageSpacing = (lines: number[]): number => {
    if (lines.length < 2) return 0;
    const sorted = [...lines].sort((a, b) => a - b);
    const intervals: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      intervals.push(sorted[i] - sorted[i - 1]);
    }
    return intervals.reduce((sum, val) => sum + val, 0) / intervals.length;
  };

  // Generate scaled grid lines with origin (0,0) at the center
  const generateScaledLines = (
    originalLines: number[],
    dimension: number,
    centerPoint: number,
    extraPositive: number = 0,
    extraNegative: number = 0
  ): number[] => {
    if (originalLines.length === 0) return [];
    
    const sorted = [...originalLines].sort((a, b) => a - b);
    const avgSpacing = calculateAverageSpacing(sorted);
    
    if (avgSpacing <= 0) return sorted; // Fallback to original if can't calculate spacing
    
    const scaledSpacing = avgSpacing * gridScale;
    
    // Always generate grid with origin (0,0) at the center point
    // The center point will always have a grid line passing through it
    const scaledLines: number[] = [];
    
    // Generate lines starting from center (origin) and going outward
    // Center line represents 0 in the grid coordinate system
    scaledLines.push(centerPoint);
    
    // Generate lines going right/down from center (positive coordinates)
    let pos = centerPoint + scaledSpacing;
    const positiveLimit = dimension + extraPositive + scaledSpacing;
    while (pos < positiveLimit) {
      scaledLines.push(pos);
      pos += scaledSpacing;
    }
    
    // Generate lines going left/up from center (negative coordinates)
    pos = centerPoint - scaledSpacing;
    const negativeLimit = -extraNegative - scaledSpacing;
    while (pos >= negativeLimit) {
      scaledLines.push(pos);
      pos -= scaledSpacing;
    }
    
    return scaledLines.sort((a, b) => a - b);
  };

  // Calculate center points
  const centerX = imageWidth / 2;
  const centerY = imageHeight / 2;

  // Use coordinate mapper for proper scaling, fallback to direct calculation if not ready
  // Use uniform scale (minimum of X and Y) to ensure grid cells are always squares
  const scaleX = coordinateMapper.isReady 
    ? coordinateMapper.getScaleX() 
    : imageBounds.width / imageWidth;
  const scaleY = coordinateMapper.isReady 
    ? coordinateMapper.getScaleY() 
    : imageBounds.height / imageHeight;
  // Use the minimum scale to ensure squares regardless of image aspect ratio
  const uniformScale = Math.min(scaleX, scaleY);

  const calculateCoverageExtras = (
    imageSize: number,
    boundsSize: number,
    offset: number
  ) => {
    const worldSizeNeeded =
      uniformScale > 0 ? boundsSize / uniformScale : imageSize;
    const shortfall = Math.max(0, worldSizeNeeded - imageSize);

    return {
      extraPositive: shortfall + Math.max(0, -offset),
      extraNegative: Math.max(0, offset),
    };
  };

  const verticalExtras = calculateCoverageExtras(
    imageWidth,
    imageBounds.width,
    gridOffsetX
  );
  const horizontalExtras = calculateCoverageExtras(
    imageHeight,
    imageBounds.height,
    gridOffsetY
  );

  // Apply scale to grid lines (centered) and extend coverage as needed
  const scaledVerticalLines = generateScaledLines(
    verticalLines,
    imageWidth,
    centerX,
    verticalExtras.extraPositive,
    verticalExtras.extraNegative
  );
  const scaledHorizontalLines = generateScaledLines(
    horizontalLines,
    imageHeight,
    centerY,
    horizontalExtras.extraPositive,
    horizontalExtras.extraNegative
  );

  // Apply offset to grid lines
  const offsetVerticalLines = scaledVerticalLines.map(line => line + gridOffsetX);
  const offsetHorizontalLines = scaledHorizontalLines.map(line => line + gridOffsetY);

  return (
    <svg
      className="absolute pointer-events-none"
      style={{
        left: `${imageBounds.left}px`,
        top: `${imageBounds.top}px`,
        width: `${imageBounds.width}px`,
        height: `${imageBounds.height}px`,
        isolation: 'isolate',
        mixBlendMode: 'normal',
        backgroundColor: 'transparent',
        opacity: 1,
        zIndex: 10,
      }}
      preserveAspectRatio="none"
      fill="none"
    >
      {/* Vertical gridlines */}
      {offsetVerticalLines.map((x, index) => (
        <line
          key={`v-${index}`}
          x1={x * uniformScale}
          y1={0}
          x2={x * uniformScale}
          y2={imageBounds.height}
          stroke="rgba(255, 255, 255, 0.3)"
          strokeWidth="1"
          fill="none"
        />
      ))}

      {/* Horizontal gridlines */}
      {offsetHorizontalLines.map((y, index) => (
        <line
          key={`h-${index}`}
          x1={0}
          y1={y * uniformScale}
          x2={imageBounds.width}
          y2={y * uniformScale}
          stroke="rgba(255, 255, 255, 0.3)"
          strokeWidth="1"
          fill="none"
        />
      ))}
    </svg>
  );
};
