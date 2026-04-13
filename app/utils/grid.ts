export interface GridPositions {
  xLines: number[]; // Vertical line x-positions in image pixels (offset applied)
  yLines: number[]; // Horizontal line y-positions in image pixels (offset applied)
  spacingX: number; // Cell width in image pixels (after gridScale)
  spacingY: number; // Cell height in image pixels (after gridScale)
}

const calculateAverageSpacing = (lines: number[]): number => {
  if (lines.length < 2) return 0;
  const sorted = [...lines].sort((a, b) => a - b);
  let sum = 0;
  for (let i = 1; i < sorted.length; i++) sum += sorted[i] - sorted[i - 1];
  return sum / (sorted.length - 1);
};

const generateLines = (
  spacing: number,
  centerPoint: number,
  dimension: number,
  offset: number,
  extraPositive: number,
  extraNegative: number
): number[] => {
  const lines: number[] = [centerPoint];

  let pos = centerPoint + spacing;
  while (pos < dimension + extraPositive + spacing) {
    lines.push(pos);
    pos += spacing;
  }

  pos = centerPoint - spacing;
  while (pos >= -extraNegative - spacing) {
    lines.push(pos);
    pos -= spacing;
  }

  return lines.map((l) => l + offset).sort((a, b) => a - b);
};

/**
 * Single source of truth for grid line positions.
 * GridLines renders these; snapToGridCenter snaps to their intersections.
 *
 * Lines are returned in image-pixel space (before any screen-scale factor).
 * Pass extraPositive/extraNegative to extend lines beyond the image bounds
 * (used by GridLines for coverage when the container is larger than the image).
 */
export const computeGridLines = (
  gridData: {
    verticalLines: number[];
    horizontalLines: number[];
    imageWidth: number;
    imageHeight: number;
  },
  gridScale = 1.0,
  gridOffsetX = 0,
  gridOffsetY = 0,
  extraPositiveX = 0,
  extraNegativeX = 0,
  extraPositiveY = 0,
  extraNegativeY = 0,
  scaleX?: number,
  scaleY?: number
): GridPositions => {
  const { verticalLines, horizontalLines, imageWidth, imageHeight } = gridData;

  const avgV = calculateAverageSpacing(verticalLines);
  const avgH = calculateAverageSpacing(horizontalLines);

  const baseSpacingX = (avgV || avgH) * gridScale;
  const baseSpacingY = (avgH || avgV) * gridScale;

  // When screen scales are provided, adjust virtual spacings so cells appear square.
  // spacingX * scaleX == spacingY * scaleY == baseSpacing * min(scaleX, scaleY)
  let spacingX = baseSpacingX;
  let spacingY = baseSpacingY;
  if (scaleX && scaleY && scaleX > 0 && scaleY > 0) {
    const uniformScale = Math.min(scaleX, scaleY);
    spacingX = baseSpacingX * (uniformScale / scaleX);
    spacingY = baseSpacingY * (uniformScale / scaleY);
  }

  const xLines =
    spacingX > 0
      ? generateLines(spacingX, imageWidth / 2, imageWidth, gridOffsetX, extraPositiveX, extraNegativeX)
      : [];
  const yLines =
    spacingY > 0
      ? generateLines(spacingY, imageHeight / 2, imageHeight, gridOffsetY, extraPositiveY, extraNegativeY)
      : [];

  return { xLines, yLines, spacingX, spacingY };
};
