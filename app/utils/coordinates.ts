import { ImageBounds, Position } from "../types";

/**
 * Convert image-relative percentage coordinates to viewport coordinates
 */
export const getViewportPosition = (
  position: Position,
  imageBounds: ImageBounds | null
): Position => {
  if (!imageBounds) {
    return { x: 0, y: 0 };
  }

  const x = imageBounds.left + (position.x / 100) * imageBounds.width;
  const y = imageBounds.top + (position.y / 100) * imageBounds.height;

  return {
    x: ((x - imageBounds.containerLeft) / imageBounds.containerWidth) * 100,
    y: ((y - imageBounds.containerTop) / imageBounds.containerHeight) * 100,
  };
};

/**
 * Convert viewport coordinates to image-relative percentage coordinates
 */
export const getImagePosition = (
  clientX: number,
  clientY: number,
  imageBounds: ImageBounds | null
): Position | null => {
  if (!imageBounds) return null;

  const x = Math.max(
    0,
    Math.min(100, ((clientX - imageBounds.left) / imageBounds.width) * 100)
  );
  const y = Math.max(
    0,
    Math.min(100, ((clientY - imageBounds.top) / imageBounds.height) * 100)
  );

  return { x, y };
};

/**
 * Convert image-relative size percentage to viewport size percentage
 */
export const getViewportSize = (
  imageSizePercent: number,
  imageBounds: ImageBounds | null
): number => {
  if (!imageBounds) {
    return 0;
  }
  // Convert percentage of image width to pixels, then to viewport percentage
  const sizeInPixels = (imageSizePercent / 100) * imageBounds.width;
  return (sizeInPixels / imageBounds.containerWidth) * 100;
};

/**
 * Get circle size as percentage of image width
 */
export const getCircleSizePercent = (): number => {
  return 5; // 5% of image width
};

