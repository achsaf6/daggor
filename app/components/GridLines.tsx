import { ImageBounds } from '../types';
import { useCoordinateMapper } from '../hooks/useCoordinateMapper';

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
    centerPoint: number
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
    while (pos < dimension + scaledSpacing) {
      scaledLines.push(pos);
      pos += scaledSpacing;
    }
    
    // Generate lines going left/up from center (negative coordinates)
    pos = centerPoint - scaledSpacing;
    while (pos >= -scaledSpacing) {
      scaledLines.push(pos);
      pos -= scaledSpacing;
    }
    
    return scaledLines.sort((a, b) => a - b);
  };

  // Calculate center points
  const centerX = imageWidth / 2;
  const centerY = imageHeight / 2;

  // Apply scale to grid lines (centered)
  const scaledVerticalLines = generateScaledLines(verticalLines, imageWidth, centerX);
  const scaledHorizontalLines = generateScaledLines(horizontalLines, imageHeight, centerY);

  // Apply offset to grid lines
  const offsetVerticalLines = scaledVerticalLines.map(line => line + gridOffsetX);
  const offsetHorizontalLines = scaledHorizontalLines.map(line => line + gridOffsetY);

  // Use coordinate mapper for proper scaling, fallback to direct calculation if not ready
  const scaleX = coordinateMapper.isReady 
    ? coordinateMapper.getScaleX() 
    : imageBounds.width / imageWidth;
  const scaleY = coordinateMapper.isReady 
    ? coordinateMapper.getScaleY() 
    : imageBounds.height / imageHeight;

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
          x1={x * scaleX}
          y1={0}
          x2={x * scaleX}
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
          y1={y * scaleY}
          x2={imageBounds.width}
          y2={y * scaleY}
          stroke="rgba(255, 255, 255, 0.3)"
          strokeWidth="1"
          fill="none"
        />
      ))}
    </svg>
  );
};
