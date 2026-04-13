import { ImageBounds } from '../../types';
import { useCoordinateMapper } from '../../hooks/useCoordinateMapper';
import { computeGridLines } from '../../utils/grid';

export const getRelativeImageOffsets = (imageBounds: ImageBounds) => ({
  left: imageBounds.left - imageBounds.containerLeft,
  top: imageBounds.top - imageBounds.containerTop,
});

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

  const { imageWidth, imageHeight } = gridData;

  // Use per-axis scale so grid lines and tokens share the same coordinate mapping.
  // uniformScale (Math.min) was previously used to keep cells square on screen, but it
  // misaligns with token rendering (which uses scaleX for X and scaleY for Y), causing
  // snapped tokens to appear in the wrong cells on non-square images.
  // With real gridData (actual image dimensions), scaleX == scaleY anyway.
  const scaleX = coordinateMapper.isReady
    ? coordinateMapper.getScaleX()
    : imageBounds.width / imageWidth;
  const scaleY = coordinateMapper.isReady
    ? coordinateMapper.getScaleY()
    : imageBounds.height / imageHeight;

  // Extend lines beyond image bounds to fill the container when it is larger than the image.
  // With per-axis scaling, imageSize * scale == boundsSize exactly, so shortfall is 0;
  // extras are only needed to cover the offset shift.
  const calculateCoverageExtras = (
    imageSize: number,
    boundsSize: number,
    scale: number,
    offset: number
  ) => {
    const worldSizeNeeded = scale > 0 ? boundsSize / scale : imageSize;
    const shortfall = Math.max(0, worldSizeNeeded - imageSize);
    return {
      extraPositive: shortfall + Math.max(0, -offset),
      extraNegative: Math.max(0, offset),
    };
  };

  const vExtras = calculateCoverageExtras(imageWidth, imageBounds.width, scaleX, gridOffsetX);
  const hExtras = calculateCoverageExtras(imageHeight, imageBounds.height, scaleY, gridOffsetY);

  // computeGridLines is the single source of truth for line positions.
  // snapToGridCenter uses the same function so snapping always aligns with what is rendered.
  const { xLines, yLines } = computeGridLines(
    gridData,
    gridScale,
    gridOffsetX,
    gridOffsetY,
    vExtras.extraPositive,
    vExtras.extraNegative,
    hExtras.extraPositive,
    hExtras.extraNegative,
    scaleX,
    scaleY
  );

  const relativeOffsets = getRelativeImageOffsets(imageBounds);

  return (
    <svg
      className="absolute pointer-events-none"
      style={{
        left: `${relativeOffsets.left}px`,
        top: `${relativeOffsets.top}px`,
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
      {xLines.map((x, index) => (
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
      {yLines.map((y, index) => (
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
