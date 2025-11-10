import { ImageBounds, Position } from "../types";
import { ImageRelativePosition, ScreenPosition } from "../hooks/useCoordinateMapper";

/**
 * Convert image-relative percentage coordinates to viewport coordinates
 * @deprecated Consider using useCoordinateMapper hook for better scaling support
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
 * @deprecated Consider using useCoordinateMapper hook for better scaling support
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
 * Uses the coordinate mapper system for proper scaling across screen sizes
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
 * Get token size as percentage of image width
 */
export const getTokenSizePercent = (): number => {
  return 5; // 5% of image width
};

/**
 * Helper to convert Position to ImageRelativePosition
 */
export const positionToImageRelative = (position: Position): ImageRelativePosition => {
  return { x: position.x, y: position.y };
};

/**
 * Helper to convert ImageRelativePosition to Position
 */
export const imageRelativeToPosition = (pos: ImageRelativePosition): Position => {
  return { x: pos.x, y: pos.y };
};

/**
 * Helper to convert ScreenPosition to Position (for viewport percentage)
 */
export const screenToViewportPosition = (
  screenPos: ScreenPosition,
  imageBounds: ImageBounds | null
): Position => {
  if (!imageBounds) {
    return { x: 0, y: 0 };
  }
  
  return {
    x: ((screenPos.x - imageBounds.containerLeft) / imageBounds.containerWidth) * 100,
    y: ((screenPos.y - imageBounds.containerTop) / imageBounds.containerHeight) * 100,
  };
};

