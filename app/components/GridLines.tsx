import { ImageBounds } from '../types';

interface GridLinesProps {
  gridData: {
    verticalLines: number[];
    horizontalLines: number[];
    imageWidth: number;
    imageHeight: number;
  };
  imageBounds: ImageBounds | null;
}

export const GridLines = ({ gridData, imageBounds }: GridLinesProps) => {
  if (!imageBounds || !gridData) return null;

  const { verticalLines, horizontalLines, imageWidth, imageHeight } = gridData;

  // Calculate scale factors to convert from image coordinates to screen coordinates
  const scaleX = imageBounds.width / imageWidth;
  const scaleY = imageBounds.height / imageHeight;

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
      }}
      preserveAspectRatio="none"
      fill="none"
    >
      {/* Vertical gridlines */}
      {verticalLines.map((x, index) => (
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
      {horizontalLines.map((y, index) => (
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

